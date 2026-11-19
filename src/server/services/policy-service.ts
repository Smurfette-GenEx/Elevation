import { prisma } from "../db";
import { evaluatePolicies, type PolicyResult, type PolicyRuleInput } from "../domain/policy-engine";
import { d } from "../domain/money";
import { isoDate } from "../domain/dates";
import { loadFxTable } from "./fx-service";
import { projectedOverruns } from "./budget-service";

/** Stable key used to attach an employee justification to a finding. */
export const findingKey = (f: { ruleType: string; expenseId: string | null }) => `${f.ruleType}:${f.expenseId ?? "report"}`;

/** Gathers everything the policy engine needs for a report and evaluates it. */
export async function evaluateReportPolicies(reportId: string, submissionDate = new Date()): Promise<PolicyResult> {
  const report = await prisma.expenseReport.findUniqueOrThrow({
    where: { id: reportId },
    include: {
      employee: true,
      legalEntity: { include: { group: true } },
      expenses: { include: { category: true, receipt: { select: { sha256: true } } }, orderBy: { lineNo: "asc" } },
    },
  });
  const groupId = report.legalEntity.groupId;
  const lines = report.expenses;
  if (!lines.length) return { findings: [], blocking: [], exceptions: [], warnings: [], canSubmit: false };

  const dates = lines.map((l) => l.expenseDate.getTime());
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates, submissionDate.getTime()));
  const countryCodes = [...new Set(lines.map((l) => l.countryCode).concat(report.employee.countryCode))];
  const receiptHashes = lines.map((l) => l.receipt?.sha256).filter((h): h is string => !!h);
  const yearAgo = new Date(submissionDate.getTime() - 365 * 86400_000);

  const [rules, countries, holidays, dupExpenses, dupReceipts, stats, fx] = await Promise.all([
    prisma.policyRule.findMany({ where: { groupId, active: true } }),
    prisma.country.findMany({ where: { code: { in: countryCodes } } }),
    prisma.publicHoliday.findMany({ where: { countryCode: { in: countryCodes }, date: { gte: minDate, lte: maxDate } } }),
    prisma.expense.findMany({
      where: {
        fingerprint: { in: lines.map((l) => l.fingerprint) },
        reportId: { not: report.id },
        report: { employeeId: report.employeeId, status: { notIn: ["REJECTED"] } },
      },
      select: { fingerprint: true, report: { select: { number: true } } },
    }),
    receiptHashes.length
      ? prisma.expense.findMany({
          where: { reportId: { not: report.id }, receipt: { sha256: { in: receiptHashes } }, report: { status: { notIn: ["REJECTED"] }, legalEntity: { groupId } } },
          select: { receipt: { select: { sha256: true } }, report: { select: { number: true } } },
        })
      : Promise.resolve([]),
    prisma.expense.groupBy({
      by: ["categoryId"],
      where: {
        categoryId: { in: [...new Set(lines.map((l) => l.categoryId))] },
        expenseDate: { gte: yearAgo },
        report: { status: { in: ["APPROVED", "READY_FOR_PAYMENT", "PAYMENT_INITIATED", "PAID"] }, legalEntity: { groupId } },
      },
      _avg: { reportingAmount: true },
      _count: { _all: true },
    }),
    loadFxTable(minDate, maxDate),
  ]);

  const budgetOverruns = await projectedOverruns({
    legalEntityId: report.legalEntityId,
    departmentId: report.employee.departmentId,
    basis: report.legalEntity.group.budgetBasis,
    lines: lines.map((l) => ({ id: l.id, expenseDate: l.expenseDate, costCenterId: l.costCenterId, projectId: l.projectId, categoryId: l.categoryId, functionalAmount: d(l.functionalAmount) })),
  });

  const ruleInputs: PolicyRuleInput[] = rules.map((r) => ({
    id: r.id, name: r.name, type: r.type, countryCode: r.countryCode, legalEntityId: r.legalEntityId, categoryId: r.categoryId,
    params: (r.params ?? {}) as Record<string, unknown>, currency: r.currency, action: r.action, severity: r.severity, priority: r.priority,
  }));

  return evaluatePolicies(
    ruleInputs,
    {
      legalEntityId: report.legalEntityId,
      countryCode: report.employee.countryCode,
      reportingCurrency: report.reportingCurrency,
      submissionDate,
      weekendDaysByCountry: Object.fromEntries(countries.map((c) => [c.code, c.weekendDays])),
      holidays: holidays.map((h) => ({ countryCode: h.countryCode, date: isoDate(h.date), name: h.name })),
      existingFingerprints: new Map(dupExpenses.map((e) => [e.fingerprint, e.report.number])),
      existingReceiptHashes: new Map(dupReceipts.map((e) => [e.receipt!.sha256, e.report.number])),
      categoryStats: new Map(stats.map((s) => [s.categoryId, { avg: d(s._avg.reportingAmount ?? 0), count: s._count._all }])),
      budgetOverruns,
      convert: (amount, from, to, date) => fx.convert(amount, from, to, date).amount,
    },
    lines.map((l) => ({
      id: l.id, lineNo: l.lineNo, expenseDate: l.expenseDate, categoryId: l.categoryId, categoryName: l.category.name,
      isMeal: l.category.isMeal, isAccommodation: l.category.isAccommodation, isMileage: l.category.isMileage,
      countryCode: l.countryCode, merchant: l.merchant, description: l.description, currency: l.currency,
      grossAmount: l.grossAmount, reportingAmount: l.reportingAmount, nights: l.nights, hasReceipt: !!l.receiptId,
      receiptSha256: l.receipt?.sha256 ?? null, fingerprint: l.fingerprint, costCenterId: l.costCenterId, projectId: l.projectId,
    })),
  );
}
