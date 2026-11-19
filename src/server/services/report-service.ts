import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { d, roundMoney, splitGross, sum, Decimal } from "../domain/money";
import { toDateOnly, addHours } from "../domain/dates";
import { expenseFingerprint } from "../domain/duplicates";
import { findMileageRate, mileageAmount } from "../domain/mileage";
import { FxRateNotFoundError, fxDifference, rateDeviationPct } from "../domain/fx";
import { planApprovalChain, selectWorkflow, RoutingError, EDITABLE_STATUSES, assertTransition, type ReportStatus } from "../domain/approval-engine";
import { can, hasRole, reportReadWhere, scopeFor, scopeIncludesEntity, type Actor } from "../auth/scope";
import { businessRule, conflict, forbidden, notFound, validation } from "../errors";
import { audit } from "../infra/audit";
import { loadFxTable } from "./fx-service";
import { evaluateReportPolicies, findingKey } from "./policy-service";
import { buildResolver, loadWorkflows } from "./routing-service";
import { notify, runAfterCommit } from "./notification-service";
import { checkBudgetAlerts } from "./budget-service";
import type { ExpenseLineInput } from "../validation";

const MAX_FX_OVERRIDE_DEVIATION_PCT = 10;

// ───────────────────────────── Queries ─────────────────────────────

export async function listReports(
  actor: Actor,
  filter: { mine?: boolean; status?: ReportStatus[]; legalEntityId?: string; q?: string; take?: number; skip?: number },
) {
  const scoped = await reportReadWhere(actor);
  const where: Prisma.ExpenseReportWhereInput = {
    AND: [
      scoped,
      filter.mine ? { employeeId: actor.id } : {},
      filter.status?.length ? { status: { in: filter.status } } : {},
      filter.legalEntityId ? { legalEntityId: filter.legalEntityId } : {},
      filter.q ? { OR: [{ number: { contains: filter.q, mode: "insensitive" } }, { title: { contains: filter.q, mode: "insensitive" } }, { employee: { name: { contains: filter.q, mode: "insensitive" } } }] } : {},
    ],
  };
  const [items, total] = await Promise.all([
    prisma.expenseReport.findMany({
      where,
      include: { employee: { select: { name: true } }, legalEntity: { select: { code: true } }, _count: { select: { expenses: true, violations: true } } },
      orderBy: { updatedAt: "desc" },
      take: Math.min(filter.take ?? 50, 200),
      skip: filter.skip ?? 0,
    }),
    prisma.expenseReport.count({ where }),
  ]);
  return { items, total };
}

/** Loads a report the actor is allowed to see; out-of-scope reports are reported as not found. */
export async function getReportForActor(actor: Actor, reportId: string) {
  const where = await reportReadWhere(actor);
  const report = await prisma.expenseReport.findFirst({
    where: { AND: [{ id: reportId }, where] },
    include: {
      employee: { select: { id: true, name: true, email: true, employeeNumber: true, managerId: true, departmentId: true, countryCode: true } },
      legalEntity: true,
      trip: true,
      expenses: { include: { category: true, costCenter: true, project: true, receipt: true }, orderBy: { lineNo: "asc" } },
      tasks: { include: { approver: { select: { id: true, name: true } } }, orderBy: [{ sequence: "asc" }, { createdAt: "asc" }] },
      comments: { orderBy: { createdAt: "asc" } },
      violations: { include: { expense: { select: { lineNo: true } } }, orderBy: { createdAt: "asc" } },
      settlements: { include: { advance: true } },
      payments: { include: { batch: true } },
    },
  });
  if (!report) throw notFound("Expense report");
  return report;
}

export async function getReportDetail(actor: Actor, reportId: string) {
  const report = await getReportForActor(actor, reportId);
  const isOwner = report.employeeId === actor.id;
  const status = report.status as ReportStatus;
  const exceptionScope = await scopeFor(actor, "exception:decide");
  const fxScope = await scopeFor(actor, "fx:override");
  const commentAuthors = await prisma.user.findMany({ where: { id: { in: [...new Set(report.comments.map((c) => c.authorId))] } }, select: { id: true, name: true } });
  const pendingTask = report.tasks.find((t) => t.status === "PENDING" && t.approverId === actor.id) ?? null;
  const infoTask = report.tasks.find((t) => t.status === "INFO_REQUESTED") ?? null;
  return {
    report,
    authors: Object.fromEntries(commentAuthors.map((a) => [a.id, a.name])),
    permissions: {
      isOwner,
      canEdit: isOwner && EDITABLE_STATUSES.includes(status),
      canSubmit: isOwner && EDITABLE_STATUSES.includes(status) && report.expenses.length > 0,
      canWithdraw: isOwner && status === "SUBMITTED" && !report.tasks.some((t) => t.status === "APPROVED"),
      canRespondInfo: isOwner && status === "INFO_REQUESTED" && !!infoTask,
      pendingTaskId: pendingTask?.id ?? null,
      canDecideExceptions: !isOwner && scopeIncludesEntity(exceptionScope, report.legalEntityId) && ["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED"].includes(status),
      canOverrideFx: !isOwner && scopeIncludesEntity(fxScope, report.legalEntityId) && ["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED"].includes(status),
      canComment: true,
    },
  };
}

// ───────────────────────────── Draft editing ─────────────────────────────

async function nextReportNumber(tx: Tx, entityCode: string, legalEntityId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `${entityCode}-${year}-`;
  const last = await tx.expenseReport.findFirst({ where: { legalEntityId, number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } });
  const seq = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(6, "0")}`;
}

export async function createReport(actor: Actor, input: { title: string; purpose?: string | null; tripId?: string | null }) {
  if (!can(actor, "report:create")) throw forbidden("Your profile cannot create expense reports");
  if (input.tripId) {
    const trip = await prisma.trip.findFirst({ where: { id: input.tripId, employeeId: actor.id } });
    if (!trip) throw validation("Unknown trip");
  }
  const entity = await prisma.legalEntity.findUniqueOrThrow({ where: { id: actor.legalEntityId }, include: { group: true } });
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const number = await nextReportNumber(tx, entity.code, entity.id);
        const report = await tx.expenseReport.create({
          data: {
            number,
            employeeId: actor.id,
            legalEntityId: entity.id,
            title: input.title,
            purpose: input.purpose ?? null,
            tripId: input.tripId ?? null,
            currency: entity.functionalCurrency,
            reportingCurrency: entity.group.reportingCurrency,
          },
        });
        await audit(actor, { action: "report.created", entityType: "ExpenseReport", entityId: report.id, legalEntityId: entity.id }, tx);
        return report;
      });
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e; // retry on number collision
    }
  }
  throw conflict("Could not allocate a report number, please retry");
}

async function loadEditableReport(tx: Tx, actor: Actor, reportId: string) {
  const report = await tx.expenseReport.findUnique({ where: { id: reportId }, include: { legalEntity: { include: { group: true } } } });
  if (!report || report.employeeId !== actor.id) throw notFound("Expense report");
  if (!EDITABLE_STATUSES.includes(report.status as ReportStatus)) throw businessRule("Only draft or rejected reports can be modified");
  return report;
}

export async function updateReportHeader(actor: Actor, reportId: string, input: { title?: string; purpose?: string | null; version: number }) {
  return prisma.$transaction(async (tx) => {
    await loadEditableReport(tx, actor, reportId);
    const res = await tx.expenseReport.updateMany({
      where: { id: reportId, version: input.version },
      data: { title: input.title, purpose: input.purpose, version: { increment: 1 } },
    });
    if (res.count === 0) throw conflict("The report was modified by someone else. Reload and try again.");
  });
}

/** Recomputes report totals from its lines (never trusts client-side totals). */
export async function recomputeTotals(tx: Tx, reportId: string) {
  const lines = await tx.expense.findMany({ where: { reportId } });
  const report = await tx.expenseReport.findUniqueOrThrow({ where: { id: reportId } });
  const totalFunctional = sum(lines.map((l) => l.functionalAmount));
  const totalReporting = sum(lines.map((l) => l.reportingAmount));
  const reimbursable = sum(lines.filter((l) => l.reimbursable).map((l) => l.functionalAmount));
  await tx.expenseReport.update({
    where: { id: reportId },
    data: {
      totalFunctional,
      totalReporting,
      reimbursableAmount: reimbursable,
      netPayable: Decimal.max(reimbursable.minus(d(report.advanceApplied)), 0),
      version: { increment: 1 },
    },
  });
}

export async function saveExpenseLine(actor: Actor, reportId: string, lineId: string | null, input: ExpenseLineInput) {
  const result = await prisma.$transaction(async (tx) => {
    const report = await loadEditableReport(tx, actor, reportId);
    const functional = report.currency;
    const reporting = report.reportingCurrency;
    const expenseDate = toDateOnly(input.expenseDate);
    if (expenseDate > new Date()) throw validation("Expense date cannot be in the future");

    const [category, costCenter, project] = await Promise.all([
      tx.expenseCategory.findFirst({ where: { id: input.categoryId, groupId: actor.groupId, active: true } }),
      tx.costCenter.findFirst({ where: { id: input.costCenterId, legalEntityId: report.legalEntityId, active: true } }),
      input.projectId ? tx.project.findFirst({ where: { id: input.projectId, groupId: actor.groupId, active: true, OR: [{ legalEntityId: null }, { legalEntityId: report.legalEntityId }] } }) : null,
    ]);
    if (!category) throw validation("Unknown or inactive expense category");
    if (!costCenter) throw validation("Cost center does not belong to your legal entity");
    if (input.projectId && !project) throw validation("Unknown or inactive project");
    if (category.requiresAttendees && !input.attendees?.trim()) throw validation(`Attendees are required for ${category.name}`);
    if (category.isAccommodation && !input.nights) throw validation("Number of nights is required for accommodation");

    if (input.receiptId) {
      const receipt = await tx.receipt.findFirst({ where: { id: input.receiptId, ownerId: actor.id } });
      if (!receipt) throw validation("Receipt not found");
    }

    // Amounts: mileage is computed from the configured rate; otherwise user-entered gross + tax
    let currency = input.currency;
    let gross: Decimal;
    let tax: Decimal;
    let mileage: { distanceKm: string; vehicleType: string; fromLocation: string; toLocation: string; mileageRate: Decimal } | null = null;
    if (category.isMileage) {
      if (!input.mileage) throw validation("Distance and vehicle are required for mileage");
      const rates = await tx.mileageRate.findMany({ where: { legalEntityId: report.legalEntityId } });
      const rate = findMileageRate(rates, input.mileage.vehicleType, expenseDate);
      if (!rate) throw businessRule(`No mileage rate configured for ${input.mileage.vehicleType} at ${input.expenseDate}`);
      currency = rate.currency;
      gross = mileageAmount(input.mileage.distanceKm, rate);
      tax = new Decimal(0);
      mileage = { ...input.mileage, mileageRate: d(rate.ratePerKm) };
    } else {
      gross = roundMoney(input.grossAmount!, currency);
      if (input.taxAmount !== undefined) tax = roundMoney(input.taxAmount, currency);
      else if (input.taxRate !== undefined) tax = splitGross(gross, input.taxRate, currency).tax;
      else tax = new Decimal(0);
      if (tax.greaterThan(gross)) throw validation("Tax cannot exceed the gross amount");
    }
    if (gross.lessThanOrEqualTo(0)) throw validation("Amount must be greater than zero");

    // FX snapshots — original amount/currency are stored untouched alongside converted values
    const fx = await loadFxTable(expenseDate, expenseDate);
    let toFunctional, toReporting;
    try {
      toFunctional = fx.convert(gross, currency, functional, expenseDate);
      toReporting = fx.convert(gross, currency, reporting, expenseDate);
    } catch (e) {
      if (e instanceof FxRateNotFoundError) throw businessRule(`${e.message}. Ask Finance to load the rate.`);
      throw e;
    }

    const fingerprint = expenseFingerprint({ employeeId: actor.id, expenseDate, grossAmount: gross, currency, merchant: input.merchant });
    const paymentMethod = input.paymentMethod;
    const data = {
      expenseDate,
      categoryId: category.id,
      merchant: input.merchant,
      description: input.description,
      countryCode: input.countryCode,
      currency,
      grossAmount: gross,
      taxAmount: tax,
      netAmount: gross.minus(tax),
      taxRate: input.taxRate ?? null,
      fxRateFunctional: toFunctional.rate,
      fxSourceFunctional: toFunctional.source,
      fxDateFunctional: toFunctional.effectiveDate,
      fxOverridden: false,
      fxOverrideReason: null,
      fxOverrideById: null,
      functionalAmount: toFunctional.amount,
      functionalTax: roundMoney(tax.times(toFunctional.rate), functional),
      fxRateReporting: toReporting.rate,
      fxSourceReporting: toReporting.source,
      reportingAmount: toReporting.amount,
      costCenterId: costCenter.id,
      projectId: project?.id ?? null,
      budgetCode: input.budgetCode ?? null,
      paymentMethod,
      reimbursable: !["CORPORATE_CARD", "COMPANY_PAID"].includes(paymentMethod),
      attendees: input.attendees ?? null,
      nights: input.nights ?? null,
      distanceKm: mileage?.distanceKm ?? null,
      vehicleType: mileage?.vehicleType ?? null,
      fromLocation: mileage?.fromLocation ?? null,
      toLocation: mileage?.toLocation ?? null,
      mileageRate: mileage?.mileageRate ?? null,
      receiptId: input.receiptId ?? null,
      receiptMissingReason: input.receiptMissingReason ?? null,
      fingerprint,
    } satisfies Omit<Prisma.ExpenseUncheckedCreateInput, "reportId" | "lineNo">;

    let line;
    if (lineId) {
      const existing = await tx.expense.findFirst({ where: { id: lineId, reportId } });
      if (!existing) throw notFound("Expense line");
      line = await tx.expense.update({ where: { id: lineId }, data });
    } else {
      const max = await tx.expense.aggregate({ where: { reportId }, _max: { lineNo: true } });
      line = await tx.expense.create({ data: { ...data, reportId, lineNo: (max._max.lineNo ?? 0) + 1 } });
    }
    await recomputeTotals(tx, reportId);
    return line;
  });
  return result;
}

export async function deleteExpenseLine(actor: Actor, reportId: string, lineId: string) {
  await prisma.$transaction(async (tx) => {
    await loadEditableReport(tx, actor, reportId);
    const res = await tx.expense.deleteMany({ where: { id: lineId, reportId } });
    if (!res.count) throw notFound("Expense line");
    await recomputeTotals(tx, reportId);
  });
}

export async function deleteDraft(actor: Actor, reportId: string) {
  await prisma.$transaction(async (tx) => {
    const report = await loadEditableReport(tx, actor, reportId);
    if (report.status !== "DRAFT" || report.submittedAt) throw businessRule("Only never-submitted drafts can be deleted");
    await tx.expenseReport.delete({ where: { id: reportId } });
    await audit(actor, { action: "report.deleted", entityType: "ExpenseReport", entityId: reportId, legalEntityId: report.legalEntityId }, tx);
  });
}

// ───────────────────────────── Policy preview & submission ─────────────────────────────

export async function previewPolicies(actor: Actor, reportId: string) {
  const report = await getReportForActor(actor, reportId);
  const result = await evaluateReportPolicies(report.id);
  const withKey = <T extends { ruleType: string; expenseId: string | null }>(list: T[]) => list.map((f) => ({ ...f, key: findingKey(f) }));
  return { canSubmit: result.canSubmit, findings: withKey(result.findings), blocking: withKey(result.blocking), exceptions: withKey(result.exceptions), warnings: withKey(result.warnings) };
}

export async function submitReport(actor: Actor, reportId: string, input: { version: number; justifications: Record<string, string> }) {
  const pre = await prisma.expenseReport.findUnique({ where: { id: reportId }, include: { _count: { select: { expenses: true } } } });
  if (!pre || pre.employeeId !== actor.id) throw notFound("Expense report");
  if (!EDITABLE_STATUSES.includes(pre.status as ReportStatus)) throw businessRule("This report has already been submitted");
  if (pre.version !== input.version) throw conflict("The report changed since you opened it. Reload and review before submitting.");
  if (pre._count.expenses === 0) throw businessRule("Add at least one expense before submitting");

  const now = new Date();
  const policy = await evaluateReportPolicies(reportId, now);
  if (!policy.canSubmit) {
    throw businessRule("The report contains blocking policy violations", { blocking: policy.blocking.map((f) => ({ ...f, key: findingKey(f) })) });
  }
  const missing = policy.exceptions.filter((f) => !input.justifications[findingKey(f)]?.trim() || input.justifications[findingKey(f)].trim().length < 10);
  if (missing.length) {
    throw businessRule("A justification (min. 10 characters) is required for each policy exception", { missing: missing.map((f) => ({ ...f, key: findingKey(f) })) });
  }

  const senders: (() => Promise<void>)[] = [];
  const report = await prisma.$transaction(async (tx) => {
    // Lock the row to serialise concurrent submissions of the same report
    await tx.$queryRaw`SELECT id FROM "ExpenseReport" WHERE id = ${reportId} FOR UPDATE`;
    const r = await tx.expenseReport.findUniqueOrThrow({
      where: { id: reportId },
      include: { employee: true, legalEntity: true, expenses: { include: { category: true } } },
    });
    if (r.version !== input.version) throw conflict("The report changed since you opened it.");
    assertTransition(r.status as ReportStatus, "SUBMITTED");

    // Fresh evaluation replaces any findings of a previous (rejected) submission
    await tx.policyViolation.deleteMany({ where: { reportId } });
    if (policy.findings.length) {
      await tx.policyViolation.createMany({
        data: policy.findings.map((f) => ({
          reportId,
          expenseId: f.expenseId,
          ruleId: f.ruleId,
          ruleType: f.ruleType,
          severity: f.severity,
          action: f.action,
          message: f.message,
          justification: input.justifications[findingKey(f)]?.trim() || null,
          status: "OPEN" as const,
        })),
      });
    }

    // Approval routing
    const workflows = await loadWorkflows(actor.groupId, tx);
    const fx = await loadFxTable(now, now);
    const ctx = {
      employeeId: r.employeeId,
      countryCode: r.legalEntity.countryCode,
      legalEntityId: r.legalEntityId,
      departmentId: r.employee.departmentId,
      categoryCodes: [...new Set(r.expenses.map((e) => e.category.code))],
      projectIds: [...new Set(r.expenses.map((e) => e.projectId).filter((x): x is string => !!x))],
      costCenterIds: [...new Set(r.expenses.map((e) => e.costCenterId))],
      hasExceptions: policy.exceptions.length > 0,
      totalIn: (cur: string) => (cur === r.reportingCurrency ? d(r.totalReporting) : fx.convert(r.totalReporting, r.reportingCurrency, cur, now).amount),
    };
    let workflow, chain;
    try {
      workflow = selectWorkflow(workflows, ctx);
      chain = planApprovalChain(workflow, ctx, await buildResolver(r.employee, r.legalEntityId, workflow, tx));
    } catch (e) {
      if (e instanceof RoutingError || e instanceof FxRateNotFoundError) throw businessRule(e.message);
      throw e;
    }

    await tx.approvalTask.updateMany({ where: { reportId, status: { in: ["WAITING", "PENDING"] } }, data: { status: "CANCELLED" } });
    for (const t of chain) {
      await tx.approvalTask.create({
        data: {
          reportId,
          sequence: t.sequence,
          name: t.name,
          approverType: t.approverType,
          role: t.role,
          approverId: t.approverId,
          originalApproverId: t.originalApproverId,
          status: t.status,
          slaHours: t.slaHours,
          escalateToRole: t.escalateToRole,
          comment: t.comment,
          activatedAt: t.status === "PENDING" ? now : null,
          dueAt: t.status === "PENDING" ? addHours(now, t.slaHours) : null,
        },
      });
    }
    const first = chain.find((t) => t.status === "PENDING")!;
    const updated = await tx.expenseReport.update({
      where: { id: reportId },
      data: { status: "SUBMITTED", submittedAt: now, rejectedAt: null, workflowId: workflow.id, currentStep: first.sequence, version: { increment: 1 } },
    });

    await audit(actor, {
      action: "report.submitted",
      entityType: "ExpenseReport",
      entityId: reportId,
      legalEntityId: r.legalEntityId,
      data: { workflow: workflow.name, chain: chain.map((c) => ({ step: c.name, approver: c.approverId, status: c.status })), findings: policy.findings.length, totalReporting: r.totalReporting.toString() },
    }, tx);

    const link = `/expenses/${reportId}`;
    senders.push(await notify({ userIds: [first.approverId], type: "APPROVAL_PENDING", title: `Approval needed: ${r.number}`, body: `${r.employee.name} submitted "${r.title}" (${d(r.totalFunctional).toFixed(2)} ${r.currency}).`, link }, tx));
    senders.push(await notify({ userIds: [r.employeeId], type: "REPORT_SUBMITTED", title: `${r.number} submitted`, body: `Your report "${r.title}" is awaiting approval from ${first.name}.`, link }, tx));
    const serious = policy.findings.filter((f) => f.severity === "HIGH" || f.severity === "CRITICAL");
    if (serious.length) {
      const holders = await tx.roleAssignment.findMany({
        where: { role: "FINANCE_CONTROLLER", OR: [{ scopeType: "LEGAL_ENTITY", scopeId: r.legalEntityId }, { scopeType: "COUNTRY", scopeId: r.legalEntity.countryCode }] },
        select: { userId: true },
      });
      senders.push(await notify({ userIds: holders.map((h) => h.userId).filter((u) => u !== r.employeeId), type: "POLICY_VIOLATION", title: `Policy alert on ${r.number}`, body: serious.map((f) => `• [${f.severity}] ${f.message}`).join("\n"), link }, tx));
    }
    return updated;
  });

  await runAfterCommit(senders);
  for (const y of new Set((await prisma.expense.findMany({ where: { reportId }, select: { expenseDate: true } })).map((e) => e.expenseDate.getUTCFullYear()))) {
    await checkBudgetAlerts(report.legalEntityId, y).catch(() => undefined);
  }
  return report;
}

export async function withdrawReport(actor: Actor, reportId: string) {
  await prisma.$transaction(async (tx) => {
    const r = await tx.expenseReport.findUnique({ where: { id: reportId }, include: { tasks: true } });
    if (!r || r.employeeId !== actor.id) throw notFound("Expense report");
    if (r.status !== "SUBMITTED" || r.tasks.some((t) => t.status === "APPROVED")) throw businessRule("The report can no longer be withdrawn");
    await tx.approvalTask.updateMany({ where: { reportId, status: { in: ["PENDING", "WAITING"] } }, data: { status: "CANCELLED" } });
    await tx.policyViolation.deleteMany({ where: { reportId } });
    await tx.expenseReport.update({ where: { id: reportId }, data: { status: "DRAFT", currentStep: null, version: { increment: 1 } } });
    await audit(actor, { action: "report.withdrawn", entityType: "ExpenseReport", entityId: reportId, legalEntityId: r.legalEntityId }, tx);
  });
}

export async function addComment(actor: Actor, reportId: string, body: string) {
  const report = await getReportForActor(actor, reportId);
  const comment = await prisma.reportComment.create({ data: { reportId: report.id, authorId: actor.id, body } });
  return comment;
}

export async function respondToInfoRequest(actor: Actor, reportId: string, message: string) {
  const senders: (() => Promise<void>)[] = [];
  await prisma.$transaction(async (tx) => {
    const r = await tx.expenseReport.findUnique({ where: { id: reportId }, include: { tasks: true } });
    if (!r || r.employeeId !== actor.id) throw notFound("Expense report");
    const task = r.tasks.find((t) => t.status === "INFO_REQUESTED");
    if (r.status !== "INFO_REQUESTED" || !task) throw businessRule("No information request is pending on this report");
    await tx.reportComment.create({ data: { reportId, authorId: actor.id, body: message, kind: "INFO_RESPONSE" } });
    const now = new Date();
    await tx.approvalTask.update({ where: { id: task.id }, data: { status: "PENDING", activatedAt: now, dueAt: addHours(now, task.slaHours) } });
    await tx.expenseReport.update({ where: { id: reportId }, data: { status: "UNDER_REVIEW", version: { increment: 1 } } });
    await audit(actor, { action: "report.info_provided", entityType: "ExpenseReport", entityId: reportId, legalEntityId: r.legalEntityId }, tx);
    senders.push(await notify({ userIds: [task.approverId], type: "APPROVAL_PENDING", title: `Information provided on ${r.number}`, body: message.slice(0, 300), link: `/expenses/${reportId}` }, tx));
  });
  await runAfterCommit(senders);
}

/**
 * Manual FX override by Finance on a line under review. Requires fx:override in the
 * entity's scope, a justification, is capped in deviation from the reference rate
 * (except for Group Finance) and is fully audited with its FX impact.
 */
export async function overrideFxRate(actor: Actor, reportId: string, lineId: string, input: { rate: string; reason: string }) {
  const report = await getReportForActor(actor, reportId);
  if (report.employeeId === actor.id) throw forbidden("You cannot override rates on your own expenses");
  const scope = await scopeFor(actor, "fx:override");
  if (!scopeIncludesEntity(scope, report.legalEntityId)) throw forbidden("You are not authorised to override FX rates for this entity");
  if (!["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED"].includes(report.status)) throw businessRule("FX can only be overridden while the report is under review");
  const line = report.expenses.find((e) => e.id === lineId);
  if (!line) throw notFound("Expense line");
  if (line.currency === report.currency) throw businessRule("This line is already in the functional currency");

  const deviation = rateDeviationPct(line.fxRateFunctional, input.rate);
  if (deviation.greaterThan(MAX_FX_OVERRIDE_DEVIATION_PCT) && !hasRole(actor, "GROUP_FINANCE")) {
    throw businessRule(`Override deviates ${deviation.toFixed(2)}% from the reference rate (max ${MAX_FX_OVERRIDE_DEVIATION_PCT}% without Group Finance)`);
  }
  const impact = fxDifference(line.grossAmount, line.fxRateFunctional, input.rate, report.currency);
  await prisma.$transaction(async (tx) => {
    await tx.expense.update({
      where: { id: lineId },
      data: {
        fxRateFunctional: input.rate,
        fxSourceFunctional: "MANUAL",
        fxOverridden: true,
        fxOverrideReason: input.reason,
        fxOverrideById: actor.id,
        functionalAmount: roundMoney(d(line.grossAmount).times(input.rate), report.currency),
        functionalTax: roundMoney(d(line.taxAmount).times(input.rate), report.currency),
      },
    });
    await recomputeTotals(tx, reportId);
    await audit(actor, {
      action: "fx.override",
      entityType: "Expense",
      entityId: lineId,
      legalEntityId: report.legalEntityId,
      data: { reportId, previousRate: line.fxRateFunctional.toString(), newRate: input.rate, deviationPct: deviation.toFixed(4), fxImpact: impact.toFixed(2), currency: report.currency, reason: input.reason },
    }, tx);
  });
  return { impact: impact.toFixed(2), deviationPct: deviation.toFixed(2) };
}
