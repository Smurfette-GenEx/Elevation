import { prisma, type Tx } from "../db";
import { decide, DecisionError, type Decision, type TaskStatus } from "../domain/approval-engine";
import { addHours, periodOf, toDateOnly } from "../domain/dates";
import { d, Decimal } from "../domain/money";
import { scopeFor, scopeIncludesEntity, type Actor } from "../auth/scope";
import { AppError, businessRule, forbidden, notFound, validation } from "../errors";
import { audit } from "../infra/audit";
import { notify, runAfterCommit } from "./notification-service";
import { roleHoldersForEntity } from "./routing-service";
import { checkBudgetAlerts } from "./budget-service";

export async function listMyTasks(actor: Actor, opts: { includeDecided?: boolean } = {}) {
  return prisma.approvalTask.findMany({
    where: { approverId: actor.id, status: opts.includeDecided ? { in: ["APPROVED", "REJECTED"] } : { in: ["PENDING", "INFO_REQUESTED"] } },
    include: {
      report: {
        include: {
          employee: { select: { name: true } },
          legalEntity: { select: { code: true } },
          _count: { select: { expenses: true } },
          violations: { select: { severity: true, action: true, status: true } },
        },
      },
    },
    orderBy: opts.includeDecided ? { decidedAt: "desc" } : { activatedAt: "asc" },
    take: opts.includeDecided ? 50 : 500,
  });
}

/** Offsets outstanding paid advances (FIFO) against the reimbursable amount of an approved report. */
async function settleAdvances(tx: Tx, report: { id: string; employeeId: string; legalEntityId: string; currency: string; reimbursableAmount: Decimal }) {
  let remaining = d(report.reimbursableAmount);
  let applied = new Decimal(0);
  const advances = await tx.advance.findMany({
    where: { employeeId: report.employeeId, legalEntityId: report.legalEntityId, currency: report.currency, status: { in: ["PAID", "PARTIALLY_SETTLED"] } },
    orderBy: { paidAt: "asc" },
  });
  for (const adv of advances) {
    if (remaining.lessThanOrEqualTo(0)) break;
    const open = d(adv.amount).minus(d(adv.settledAmount));
    const use = Decimal.min(open, remaining);
    if (use.lessThanOrEqualTo(0)) continue;
    await tx.advanceSettlement.create({ data: { advanceId: adv.id, reportId: report.id, amount: use } });
    const settled = d(adv.settledAmount).plus(use);
    await tx.advance.update({ where: { id: adv.id }, data: { settledAmount: settled, status: settled.equals(d(adv.amount)) ? "SETTLED" : "PARTIALLY_SETTLED" } });
    remaining = remaining.minus(use);
    applied = applied.plus(use);
  }
  return { applied, netPayable: remaining };
}

export async function decideTask(actor: Actor, taskId: string, decision: Decision, comment: string | null | undefined) {
  const senders: (() => Promise<void>)[] = [];
  const result = await prisma.$transaction(async (tx) => {
    const task = await tx.approvalTask.findUnique({ where: { id: taskId } });
    if (!task) throw notFound("Approval task");
    await tx.$queryRaw`SELECT id FROM "ExpenseReport" WHERE id = ${task.reportId} FOR UPDATE`;
    const report = await tx.expenseReport.findUniqueOrThrow({
      where: { id: task.reportId },
      include: { tasks: true, violations: true, employee: { select: { name: true } }, legalEntity: true },
    });

    let outcome;
    try {
      outcome = decide(
        report.tasks.map((t) => ({ id: t.id, sequence: t.sequence, approverId: t.approverId, status: t.status as TaskStatus })),
        taskId,
        actor.id,
        report.employeeId,
        decision,
      );
    } catch (e) {
      if (e instanceof DecisionError) throw new AppError(e.code === "NOT_ACTIONABLE" ? "CONFLICT" : "FORBIDDEN", e.message);
      throw e;
    }

    if (outcome.reportStatus === "APPROVED") {
      const unresolved = report.violations.filter((v) => v.action === "REQUIRE_EXCEPTION" && v.status !== "EXCEPTION_APPROVED");
      if (unresolved.length) {
        throw businessRule(`${unresolved.length} policy exception(s) must be approved by Finance before final approval`);
      }
    }

    const now = new Date();
    for (const u of outcome.taskUpdates) {
      const isActed = u.id === taskId;
      await tx.approvalTask.update({
        where: { id: u.id },
        data: {
          status: u.status,
          ...(isActed ? { decidedAt: now, decidedById: actor.id, comment: comment ?? null } : {}),
          ...(u.status === "PENDING" ? { activatedAt: now, dueAt: addHours(now, report.tasks.find((t) => t.id === u.id)!.slaHours) } : {}),
        },
      });
    }
    if (comment) {
      await tx.reportComment.create({ data: { reportId: report.id, authorId: actor.id, body: comment, kind: decision === "REQUEST_INFO" ? "INFO_REQUEST" : "COMMENT" } });
    }

    const link = `/expenses/${report.id}`;
    const nextTask = outcome.nextTaskId ? report.tasks.find((t) => t.id === outcome.nextTaskId)! : null;
    let finalStatus: string = outcome.reportStatus;

    if (outcome.reportStatus === "APPROVED") {
      const settlement = await settleAdvances(tx, report);
      finalStatus = settlement.netPayable.greaterThan(0) ? "READY_FOR_PAYMENT" : "PAID";
      await tx.expenseReport.update({
        where: { id: report.id },
        data: {
          status: finalStatus as "READY_FOR_PAYMENT" | "PAID",
          approvedAt: now,
          paidAt: finalStatus === "PAID" ? now : null,
          accountingStatus: "READY",
          accountingPeriod: periodOf(now),
          advanceApplied: settlement.applied,
          netPayable: settlement.netPayable,
          currentStep: null,
          version: { increment: 1 },
        },
      });
      const localFinance = await roleHoldersForEntity("LOCAL_FINANCE", report.legalEntityId, tx);
      senders.push(await notify({
        userIds: [report.employeeId],
        type: "REPORT_APPROVED",
        title: `${report.number} approved`,
        body: settlement.applied.greaterThan(0)
          ? `Approved. ${settlement.applied.toFixed(2)} ${report.currency} offset against your advance; ${settlement.netPayable.toFixed(2)} ${report.currency} to be reimbursed.`
          : `Your report "${report.title}" was approved and is queued for reimbursement.`,
        link,
      }, tx));
      if (finalStatus === "READY_FOR_PAYMENT") {
        senders.push(await notify({ userIds: localFinance.slice(0, 5), type: "APPROVAL_PENDING", title: `Ready for payment: ${report.number}`, body: `${settlement.netPayable.toFixed(2)} ${report.currency} for ${report.employee.name}`, link: "/reimbursements" }, tx));
      }
    } else {
      await tx.expenseReport.update({
        where: { id: report.id },
        data: {
          status: outcome.reportStatus,
          currentStep: nextTask?.sequence ?? report.currentStep,
          rejectedAt: outcome.reportStatus === "REJECTED" ? now : undefined,
          version: { increment: 1 },
        },
      });
      if (outcome.reportStatus === "REJECTED") {
        senders.push(await notify({ userIds: [report.employeeId], type: "REPORT_REJECTED", title: `${report.number} rejected`, body: comment ?? "Your report was rejected.", link }, tx));
      } else if (outcome.reportStatus === "INFO_REQUESTED") {
        senders.push(await notify({ userIds: [report.employeeId], type: "INFO_REQUESTED", title: `Information requested on ${report.number}`, body: comment ?? "", link }, tx));
      } else if (nextTask) {
        senders.push(await notify({ userIds: [nextTask.approverId], type: "APPROVAL_PENDING", title: `Approval needed: ${report.number}`, body: `${report.employee.name} — "${report.title}" (${d(report.totalFunctional).toFixed(2)} ${report.currency}). Step: ${nextTask.name}.`, link }, tx));
      }
    }

    await audit(actor, {
      action: `approval.${decision.toLowerCase()}`,
      entityType: "ExpenseReport",
      entityId: report.id,
      legalEntityId: report.legalEntityId,
      data: { taskId, step: task.name, comment: comment ?? null, resultingStatus: finalStatus },
    }, tx);
    return { status: finalStatus, legalEntityId: report.legalEntityId, reportId: report.id };
  });
  await runAfterCommit(senders);
  if (result.status === "READY_FOR_PAYMENT" || result.status === "PAID") {
    const years = await prisma.expense.findMany({ where: { reportId: result.reportId }, select: { expenseDate: true }, distinct: ["expenseDate"] });
    for (const y of new Set(years.map((e) => e.expenseDate.getUTCFullYear()))) await checkBudgetAlerts(result.legalEntityId, y).catch(() => undefined);
  }
  return result;
}

/** Finance decision on a policy exception — mandatory justification, never on one's own expenses. */
export async function decideException(actor: Actor, violationId: string, approve: boolean, note: string) {
  if (!note || note.trim().length < 5) throw validation("A justification of at least 5 characters is mandatory");
  const v = await prisma.policyViolation.findUnique({ where: { id: violationId }, include: { report: true } });
  if (!v) throw notFound("Policy exception");
  const scope = await scopeFor(actor, "exception:decide");
  if (!scopeIncludesEntity(scope, v.report.legalEntityId)) throw notFound("Policy exception");
  if (v.report.employeeId === actor.id) throw forbidden("You cannot decide exceptions on your own expenses");
  if (v.action !== "REQUIRE_EXCEPTION") throw businessRule("This finding does not require an exception decision");
  if (v.status !== "OPEN") throw businessRule("This exception has already been decided");
  if (!["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED"].includes(v.report.status)) throw businessRule("The report is not under review");
  await prisma.$transaction(async (tx) => {
    await tx.policyViolation.update({
      where: { id: violationId },
      data: { status: approve ? "EXCEPTION_APPROVED" : "EXCEPTION_REJECTED", decidedById: actor.id, decisionNote: note, decidedAt: new Date() },
    });
    await audit(actor, {
      action: approve ? "exception.approved" : "exception.rejected",
      entityType: "PolicyViolation",
      entityId: violationId,
      legalEntityId: v.report.legalEntityId,
      data: { reportId: v.reportId, ruleType: v.ruleType, message: v.message, note },
    }, tx);
  });
}

/** Approver hands a pending task to someone else (e.g. a more appropriate reviewer). */
export async function reassignTask(actor: Actor, taskId: string, toUserId: string, reason: string) {
  const senders: (() => Promise<void>)[] = [];
  await prisma.$transaction(async (tx) => {
    const task = await tx.approvalTask.findUnique({ where: { id: taskId }, include: { report: true } });
    if (!task) throw notFound("Approval task");
    const adminScope = await scopeFor(actor, "finance:read");
    const isApprover = task.approverId === actor.id;
    if (!isApprover && !scopeIncludesEntity(adminScope, task.report.legalEntityId)) throw forbidden();
    if (task.status !== "PENDING") throw businessRule("Only pending approvals can be delegated");
    if (toUserId === task.report.employeeId) throw businessRule("An expense cannot be routed to its own claimant");
    if (toUserId === task.approverId) throw validation("Choose a different approver");
    const target = await tx.user.findFirst({ where: { id: toUserId, groupId: actor.groupId, active: true } });
    if (!target) throw validation("Unknown user");
    await tx.approvalTask.update({ where: { id: taskId }, data: { approverId: toUserId, originalApproverId: task.originalApproverId ?? task.approverId } });
    await tx.reportComment.create({ data: { reportId: task.reportId, authorId: actor.id, kind: "SYSTEM", body: `Approval "${task.name}" delegated to ${target.name}: ${reason}` } });
    await audit(actor, { action: "approval.delegated", entityType: "ApprovalTask", entityId: taskId, legalEntityId: task.report.legalEntityId, data: { from: task.approverId, to: toUserId, reason } }, tx);
    senders.push(await notify({ userIds: [toUserId], type: "APPROVAL_PENDING", title: `Approval delegated to you: ${task.report.number}`, body: reason, link: `/expenses/${task.reportId}` }, tx));
  });
  await runAfterCommit(senders);
}

export async function createDelegation(actor: Actor, input: { toUserId: string; startsAt: string; endsAt: string; reason?: string | null }) {
  if (input.toUserId === actor.id) throw validation("You cannot delegate to yourself");
  const target = await prisma.user.findFirst({ where: { id: input.toUserId, groupId: actor.groupId, active: true } });
  if (!target) throw validation("Unknown user");
  const startsAt = toDateOnly(input.startsAt);
  const endsAt = new Date(toDateOnly(input.endsAt).getTime() + 86400_000 - 1);
  if (endsAt < startsAt) throw validation("End date must be after start date");
  const del = await prisma.approvalDelegation.create({ data: { fromUserId: actor.id, toUserId: input.toUserId, startsAt, endsAt, reason: input.reason ?? null } });
  await audit(actor, { action: "delegation.created", entityType: "ApprovalDelegation", entityId: del.id, data: { to: input.toUserId, startsAt: input.startsAt, endsAt: input.endsAt } });
  return del;
}

export async function listDelegations(actor: Actor) {
  return prisma.approvalDelegation.findMany({
    where: { OR: [{ fromUserId: actor.id }, { toUserId: actor.id }], active: true, endsAt: { gte: new Date() } },
    include: { fromUser: { select: { name: true } }, toUser: { select: { name: true } } },
    orderBy: { startsAt: "asc" },
  });
}

export async function revokeDelegation(actor: Actor, id: string) {
  const res = await prisma.approvalDelegation.updateMany({ where: { id, fromUserId: actor.id }, data: { active: false } });
  if (!res.count) throw notFound("Delegation");
  await audit(actor, { action: "delegation.revoked", entityType: "ApprovalDelegation", entityId: id });
}

/**
 * Escalates overdue approvals (scheduled job). Each overdue task is reassigned to the
 * holder of its escalation role for the entity (never the claimant), or, failing that,
 * to the current approver's manager. Escalates at most twice.
 */
export async function escalateOverdueApprovals(now = new Date()) {
  const overdue = await prisma.approvalTask.findMany({
    where: { status: "PENDING", dueAt: { lt: now }, escalationLevel: { lt: 2 } },
    include: { report: true, approver: { select: { managerId: true, name: true } } },
    take: 500,
  });
  let escalated = 0;
  for (const task of overdue) {
    const candidates = task.escalateToRole ? await roleHoldersForEntity(task.escalateToRole, task.report.legalEntityId) : [];
    if (task.approver.managerId) candidates.push(task.approver.managerId);
    const target = candidates.find((c) => c !== task.report.employeeId && c !== task.approverId);
    if (!target) continue;
    const senders: (() => Promise<void>)[] = [];
    await prisma.$transaction(async (tx) => {
      await tx.approvalTask.update({
        where: { id: task.id },
        data: { approverId: target, originalApproverId: task.originalApproverId ?? task.approverId, escalationLevel: { increment: 1 }, activatedAt: now, dueAt: addHours(now, task.slaHours) },
      });
      await tx.reportComment.create({ data: { reportId: task.reportId, authorId: target, kind: "SYSTEM", body: `Approval "${task.name}" escalated after exceeding its ${task.slaHours}h SLA (was assigned to ${task.approver.name}).` } });
      await audit(null, { action: "approval.escalated", entityType: "ApprovalTask", entityId: task.id, legalEntityId: task.report.legalEntityId, data: { from: task.approverId, to: target } }, tx);
      senders.push(await notify({ userIds: [target, task.approverId], type: "APPROVAL_ESCALATED", title: `Overdue approval escalated: ${task.report.number}`, body: `"${task.name}" exceeded its SLA and was escalated.`, link: `/expenses/${task.reportId}` }, tx));
    });
    await runAfterCommit(senders);
    escalated++;
  }
  return { checked: overdue.length, escalated };
}
