import ExcelJS from "exceljs";
import { prisma } from "../db";
import { buildExpenseJournal, buildPaymentJournal, resolvePostingPeriod, AccountingError, type EntityAccounts, type JournalEntryLine } from "../domain/accounting";
import { LAYOUTS, type ErpFormat, type ExportLine } from "../domain/erp-formats";
import { toCsv } from "../domain/csv";
import { periodOf } from "../domain/dates";
import { d, sum } from "../domain/money";
import { assertEntityAccess, entityIdsFor, assertCan, type Actor } from "../auth/scope";
import { businessRule, notFound } from "../errors";
import { audit } from "../infra/audit";

async function entitySetup(legalEntityId: string) {
  const entity = await prisma.legalEntity.findUniqueOrThrow({ where: { id: legalEntityId }, include: { accountingConfig: true, accountMappings: true, periods: true } });
  if (!entity.accountingConfig) throw businessRule(`Accounting configuration missing for ${entity.code}`);
  return entity;
}

/**
 * Generates and persists the journal for every report not yet exported (EXPENSES = recognition
 * of approved reports; PAYMENTS = reimbursements paid). Rows are locked and flagged in the same
 * transaction, so a report can never be exported twice.
 */
export async function createExport(actor: Actor, legalEntityId: string, kind: "EXPENSES" | "PAYMENTS") {
  await assertEntityAccess(actor, "accounting:export", legalEntityId);
  const entity = await entitySetup(legalEntityId);
  const cfg = entity.accountingConfig!;
  const accounts: EntityAccounts = cfg;
  const mappingByCategory = new Map(entity.accountMappings.map((m) => [m.categoryId, m]));
  const periods = entity.periods.map((p) => ({ period: p.period, status: p.status }));

  return prisma.$transaction(async (tx) => {
    const lockedIds = kind === "EXPENSES"
      ? await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "ExpenseReport" WHERE "legalEntityId" = ${legalEntityId} AND "accountingStatus" = 'READY' FOR UPDATE SKIP LOCKED`
      : await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "ExpenseReport" WHERE "legalEntityId" = ${legalEntityId} AND status = 'PAID' AND "paymentExportedAt" IS NULL AND "netPayable" > 0 FOR UPDATE SKIP LOCKED`;
    if (!lockedIds.length) throw businessRule("Nothing to export for this entity");
    const reports = await tx.expenseReport.findMany({
      where: { id: { in: lockedIds.map((r) => r.id) } },
      include: { employee: true, expenses: { include: { category: true, costCenter: true, project: true } }, payments: { where: { status: "PAID" } } },
      orderBy: { number: "asc" },
    });

    const lines: (JournalEntryLine & { reportId: string; period: string; documentDate: Date })[] = [];
    for (const r of reports) {
      const docDate = kind === "EXPENSES" ? r.approvedAt ?? new Date() : r.paidAt ?? new Date();
      const period = resolvePostingPeriod(periodOf(docDate), periods);
      let journal: JournalEntryLine[];
      try {
        journal = kind === "EXPENSES"
          ? buildExpenseJournal(
              {
                reportId: r.id, reportNumber: r.number, employeeRef: r.employee.employeeNumber ?? r.employee.id, currency: r.currency, documentDate: docDate, advanceApplied: r.advanceApplied,
                lines: r.expenses.map((e) => ({
                  lineNo: e.lineNo, categoryId: e.categoryId, categoryName: e.category.name, description: e.description, merchant: e.merchant,
                  functionalAmount: e.functionalAmount, functionalTax: e.functionalTax, txnAmount: e.grossAmount, txnCurrency: e.currency,
                  costCenterCode: e.costCenter.code, projectCode: e.project?.code ?? null, reimbursable: e.reimbursable,
                })),
              },
              accounts,
              (categoryId) => {
                const m = mappingByCategory.get(categoryId);
                return m ? { glAccount: m.glAccount, analyticalAccount: m.analyticalAccount, vatCode: m.vatCode, vatDeductiblePct: m.vatDeductiblePct } : undefined;
              },
            )
          : buildPaymentJournal({ reportNumber: r.number, employeeRef: r.employee.employeeNumber ?? r.employee.id, amount: sum(r.payments.map((p) => p.amount)), currency: r.currency, bankReference: r.payments[0]?.bankReference ?? null }, accounts);
      } catch (e) {
        if (e instanceof AccountingError) throw businessRule(`${r.number}: ${e.message}`);
        throw e;
      }
      lines.push(...journal.map((l) => ({ ...l, reportId: r.id, period, documentDate: docDate })));
    }

    const totalDebit = sum(lines.map((l) => l.debit));
    const totalCredit = sum(lines.map((l) => l.credit));
    if (!totalDebit.equals(totalCredit)) throw businessRule("Export is unbalanced; aborting");
    const exportPeriod = lines.map((l) => l.period).sort().at(-1)!;

    const exp = await tx.accountingExport.create({
      data: { legalEntityId, kind, period: exportPeriod, erpFormat: cfg.erpFormat, reportCount: reports.length, lineCount: lines.length, totalDebit, totalCredit, createdById: actor.id },
    });
    await tx.journalLine.createMany({
      data: lines.map((l) => ({
        exportId: exp.id, reportId: l.reportId, legalEntityId, period: l.period, documentDate: l.documentDate, lineNo: l.lineNo, account: l.account,
        analyticalAccount: l.analyticalAccount, costCenter: l.costCenter, projectCode: l.projectCode, vatCode: l.vatCode, description: l.description,
        debit: l.debit, credit: l.credit, currency: l.currency, txnAmount: l.txnAmount, txnCurrency: l.txnCurrency, employeeRef: l.employeeRef,
      })),
    });
    const now = new Date();
    await tx.expenseReport.updateMany({
      where: { id: { in: reports.map((r) => r.id) } },
      data: kind === "EXPENSES" ? { accountingStatus: "EXPORTED", exportedAt: now } : { paymentExportedAt: now },
    });
    await audit(actor, { action: "accounting.exported", entityType: "AccountingExport", entityId: exp.id, legalEntityId, data: { kind, reports: reports.length, lines: lines.length, total: totalDebit.toFixed(2) } }, tx);
    return exp;
  });
}

export async function listExports(actor: Actor) {
  assertCan(actor, "accounting:export");
  const ids = await entityIdsFor(actor, "accounting:export");
  const [exports, ready] = await Promise.all([
    prisma.accountingExport.findMany({ where: { legalEntityId: { in: ids } }, include: { legalEntity: { select: { code: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.expenseReport.groupBy({ by: ["legalEntityId"], where: { legalEntityId: { in: ids }, accountingStatus: "READY" }, _count: { _all: true } }),
  ]);
  const paidReady = await prisma.expenseReport.groupBy({ by: ["legalEntityId"], where: { legalEntityId: { in: ids }, status: "PAID", paymentExportedAt: null, netPayable: { gt: 0 } }, _count: { _all: true } });
  const entities = await prisma.legalEntity.findMany({ where: { id: { in: ids } }, include: { accountingConfig: true, periods: { orderBy: { period: "desc" }, take: 6 } }, orderBy: { code: "asc" } });
  return {
    exports,
    entities: entities.map((e) => ({
      id: e.id, code: e.code, name: e.name, erpFormat: e.accountingConfig?.erpFormat ?? null,
      readyExpenses: ready.find((r) => r.legalEntityId === e.id)?._count._all ?? 0,
      readyPayments: paidReady.find((r) => r.legalEntityId === e.id)?._count._all ?? 0,
      periods: e.periods,
    })),
  };
}

async function exportLines(actor: Actor, exportId: string) {
  const exp = await prisma.accountingExport.findUnique({ where: { id: exportId }, include: { legalEntity: { include: { accountingConfig: true } }, lines: { include: { report: { select: { number: true } } }, orderBy: [{ reportId: "asc" }, { lineNo: "asc" }] } } });
  if (!exp) throw notFound("Export");
  await assertEntityAccess(actor, "accounting:export", exp.legalEntityId);
  const cfg = exp.legalEntity.accountingConfig!;
  const lines: ExportLine[] = exp.lines.map((l) => ({
    entityCode: exp.legalEntity.code, companyCode: cfg.companyCode, journalCode: cfg.journalCode, period: l.period, documentDate: l.documentDate,
    documentNumber: l.report.number, lineNo: l.lineNo, account: l.account, analyticalAccount: l.analyticalAccount, costCenter: l.costCenter,
    projectCode: l.projectCode, vatCode: l.vatCode, description: l.description, debit: d(l.debit).toFixed(2), credit: d(l.credit).toFixed(2),
    currency: l.currency, txnAmount: l.txnAmount ? d(l.txnAmount).toFixed(2) : null, txnCurrency: l.txnCurrency, employeeRef: l.employeeRef,
  }));
  return { exp, lines, layout: LAYOUTS[exp.erpFormat as ErpFormat] };
}

export async function renderExport(actor: Actor, exportId: string, format: "csv" | "xlsx") {
  const { exp, lines, layout } = await exportLines(actor, exportId);
  const base = `${exp.legalEntity.code}_${exp.kind.toLowerCase()}_${exp.period}_${exp.id.slice(-6)}`;
  await audit(actor, { action: "accounting.downloaded", entityType: "AccountingExport", entityId: exp.id, legalEntityId: exp.legalEntityId, data: { format } });
  if (format === "csv") {
    return { fileName: `${base}.csv`, contentType: "text/csv; charset=utf-8", body: Buffer.from(toCsv(layout.headers, lines.map(layout.row), exp.erpFormat === "SAGE" ? ";" : ",")) };
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "Group Expense Platform";
  const ws = wb.addWorksheet("Journal");
  ws.addRow(layout.headers).font = { bold: true };
  for (const l of lines) ws.addRow(layout.row(l).map((v) => (typeof v === "string" && /^-?\d+\.\d{2}$/.test(v) ? Number(v) : v)));
  ws.columns.forEach((c) => (c.width = 16));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const summary = wb.addWorksheet("Control");
  summary.addRows([["Entity", exp.legalEntity.code], ["Kind", exp.kind], ["Period", exp.period], ["Reports", exp.reportCount], ["Lines", exp.lineCount], ["Total debit", Number(exp.totalDebit)], ["Total credit", Number(exp.totalCredit)], ["Generated", exp.createdAt.toISOString()]]);
  return { fileName: `${base}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", body: Buffer.from(await wb.xlsx.writeBuffer()) };
}

export async function setPeriodStatus(actor: Actor, legalEntityId: string, period: string, status: "OPEN" | "CLOSED") {
  assertCan(actor, "accounting:configure");
  await assertEntityAccess(actor, "accounting:configure", legalEntityId);
  if (!/^\d{4}-\d{2}$/.test(period)) throw businessRule("Period must be YYYY-MM");
  const p = await prisma.accountingPeriod.upsert({
    where: { legalEntityId_period: { legalEntityId, period } },
    create: { legalEntityId, period, status, closedAt: status === "CLOSED" ? new Date() : null, closedById: status === "CLOSED" ? actor.id : null },
    update: { status, closedAt: status === "CLOSED" ? new Date() : null, closedById: status === "CLOSED" ? actor.id : null },
  });
  await audit(actor, { action: `accounting.period_${status.toLowerCase()}`, entityType: "AccountingPeriod", entityId: p.id, legalEntityId, data: { period } });
  return p;
}
