import { prisma, Prisma } from "../db";
import { d, Decimal } from "../domain/money";
import { can, scopeFor, type Actor } from "../auth/scope";
import type { Permission } from "../auth/rbac";
import { forbidden } from "../errors";
import { listBudgets } from "./budget-service";
import { loadFxTable } from "./fx-service";

export interface DashboardFilters {
  from: string; // YYYY-MM-DD
  to: string;
  countryCode?: string;
  legalEntityId?: string;
  departmentId?: string;
  costCenterId?: string;
  categoryId?: string;
  currency?: string; // transaction currency
}

/** Translates the actor's analytical scope into a SQL predicate (aliases: r = report, e = expense, u = employee). */
async function scopeSql(actor: Actor, permission: Permission): Promise<Prisma.Sql | null> {
  const s = await scopeFor(actor, permission);
  const parts: Prisma.Sql[] = [];
  if (s.all) parts.push(Prisma.sql`le."groupId" = ${actor.groupId}`);
  else if (s.entityIds.size) parts.push(Prisma.sql`r."legalEntityId" = ANY(${[...s.entityIds]})`);
  if (s.departmentIds.size) parts.push(Prisma.sql`u."departmentId" = ANY(${[...s.departmentIds]})`);
  if (s.costCenterIds.size) parts.push(Prisma.sql`e."costCenterId" = ANY(${[...s.costCenterIds]})`);
  if (permission === "dashboard:team") parts.push(Prisma.sql`u."managerId" = ${actor.id}`);
  return parts.length ? Prisma.sql`(${Prisma.join(parts, " OR ")})` : null;
}

function filterSql(f: DashboardFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [
    Prisma.sql`e."expenseDate" >= ${new Date(f.from)}::date`,
    Prisma.sql`e."expenseDate" <= ${new Date(f.to)}::date`,
    Prisma.sql`r.status NOT IN ('DRAFT', 'REJECTED')`,
  ];
  if (f.countryCode) parts.push(Prisma.sql`le."countryCode" = ${f.countryCode}`);
  if (f.legalEntityId) parts.push(Prisma.sql`r."legalEntityId" = ${f.legalEntityId}`);
  if (f.departmentId) parts.push(Prisma.sql`u."departmentId" = ${f.departmentId}`);
  if (f.costCenterId) parts.push(Prisma.sql`e."costCenterId" = ${f.costCenterId}`);
  if (f.categoryId) parts.push(Prisma.sql`e."categoryId" = ${f.categoryId}`);
  if (f.currency) parts.push(Prisma.sql`e.currency = ${f.currency}`);
  return Prisma.join(parts, " AND ");
}

interface CubeRow {
  legalEntityId: string;
  countryCode: string;
  departmentId: string | null;
  costCenterId: string;
  categoryId: string;
  currency: string;
  month: string;
  status: string;
  reporting: Prisma.Decimal;
  gross: Prisma.Decimal;
  n: bigint;
  outOfPolicy: bigint;
}

type Breakdown = { key: string; label: string; amount: number; count: number }[];

function group(rows: CubeRow[], key: (r: CubeRow) => string, label: (k: string) => string): Breakdown {
  const m = new Map<string, { amount: Decimal; count: number }>();
  for (const r of rows) {
    const k = key(r);
    const cur = m.get(k) ?? { amount: new Decimal(0), count: 0 };
    m.set(k, { amount: cur.amount.plus(d(r.reporting)), count: cur.count + Number(r.n) });
  }
  return [...m.entries()].map(([k, v]) => ({ key: k, label: label(k), amount: v.amount.toDecimalPlaces(2).toNumber(), count: v.count })).sort((a, b) => b.amount - a.amount);
}

export async function analytics(actor: Actor, permission: Permission, f: DashboardFilters) {
  if (!can(actor, permission)) throw forbidden();
  const scope = await scopeSql(actor, permission);
  if (!scope) throw forbidden();
  const where = Prisma.sql`${scope} AND ${filterSql(f)}`;

  const rows = await prisma.$queryRaw<CubeRow[]>`
    SELECT r."legalEntityId", le."countryCode", u."departmentId", e."costCenterId", e."categoryId", e.currency,
           to_char(e."expenseDate", 'YYYY-MM') AS month, r.status::text AS status,
           SUM(e."reportingAmount") AS reporting, SUM(e."grossAmount") AS gross, COUNT(*) AS n,
           COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "PolicyViolation" v WHERE v."expenseId" = e.id AND v.action <> 'WARN')) AS "outOfPolicy"
    FROM "Expense" e
    JOIN "ExpenseReport" r ON r.id = e."reportId"
    JOIN "User" u ON u.id = r."employeeId"
    JOIN "LegalEntity" le ON le.id = r."legalEntityId"
    WHERE ${where}
    GROUP BY 1, 2, 3, 4, 5, 6, 7, 8`;

  const [entities, departments, costCenters, categories, countries, group_] = await Promise.all([
    prisma.legalEntity.findMany({ where: { groupId: actor.groupId }, select: { id: true, code: true, name: true } }),
    prisma.department.findMany({ where: { legalEntity: { groupId: actor.groupId } }, select: { id: true, name: true, legalEntity: { select: { code: true } } } }),
    prisma.costCenter.findMany({ where: { legalEntity: { groupId: actor.groupId } }, select: { id: true, code: true, name: true } }),
    prisma.expenseCategory.findMany({ where: { groupId: actor.groupId }, select: { id: true, name: true } }),
    prisma.country.findMany({ where: { groupId: actor.groupId }, select: { code: true, name: true } }),
    prisma.group.findUniqueOrThrow({ where: { id: actor.groupId } }),
  ]);
  const name = <T extends { id: string }>(list: T[], fn: (x: T) => string) => (k: string) => { const x = list.find((i) => i.id === k); return x ? fn(x) : k === "null" ? "Unassigned" : k; };

  const total = rows.reduce((acc, r) => acc.plus(d(r.reporting)), new Decimal(0));
  const count = rows.reduce((acc, r) => acc + Number(r.n), 0);
  const outOfPolicy = rows.reduce((acc, r) => acc + Number(r.outOfPolicy), 0);

  // Monthly trend split by consumption bucket
  const months = new Map<string, { month: string; pending: number; approved: number; paid: number }>();
  for (const r of rows) {
    const m = months.get(r.month) ?? { month: r.month, pending: 0, approved: 0, paid: 0 };
    const v = d(r.reporting).toNumber();
    if (["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED"].includes(r.status)) m.pending += v;
    else if (r.status === "PAID") m.paid += v;
    else m.approved += v;
    months.set(r.month, m);
  }

  // Currency exposure keeps original amounts per transaction currency
  const byCurrency = new Map<string, { currency: string; original: Decimal; reporting: Decimal; count: number }>();
  for (const r of rows) {
    const c = byCurrency.get(r.currency) ?? { currency: r.currency, original: new Decimal(0), reporting: new Decimal(0), count: 0 };
    byCurrency.set(r.currency, { currency: r.currency, original: c.original.plus(d(r.gross)), reporting: c.reporting.plus(d(r.reporting)), count: c.count + Number(r.n) });
  }

  // KPIs computed at report level
  const reportScope = Prisma.sql`${scope} AND r."submittedAt" IS NOT NULL AND r."submittedAt" >= ${new Date(f.from)} AND r."submittedAt" < (${new Date(f.to)}::date + 1)`
  const entityFilter = f.legalEntityId ? Prisma.sql` AND r."legalEntityId" = ${f.legalEntityId}` : Prisma.empty;
  const countryFilter = f.countryCode ? Prisma.sql` AND le."countryCode" = ${f.countryCode}` : Prisma.empty;
  const deptFilter = f.departmentId ? Prisma.sql` AND u."departmentId" = ${f.departmentId}` : Prisma.empty;
  const [kpi] = await prisma.$queryRaw<{ reports: bigint; compliant: bigint; cycleDays: number | null; liabilities: Prisma.Decimal | null; pendingReview: bigint }[]>`
    SELECT COUNT(DISTINCT r.id) AS reports,
           COUNT(DISTINCT r.id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM "PolicyViolation" v WHERE v."reportId" = r.id AND v.action <> 'WARN')) AS compliant,
           AVG(EXTRACT(EPOCH FROM (r."paidAt" - r."submittedAt")) / 86400) FILTER (WHERE r."paidAt" IS NOT NULL) AS "cycleDays",
           SUM(CASE WHEN r.status IN ('APPROVED','READY_FOR_PAYMENT','PAYMENT_INITIATED') AND r."totalFunctional" > 0
                    THEN r."netPayable" * r."totalReporting" / r."totalFunctional" ELSE 0 END) AS liabilities,
           COUNT(DISTINCT r.id) FILTER (WHERE r.status IN ('SUBMITTED','UNDER_REVIEW','INFO_REQUESTED')) AS "pendingReview"
    FROM "ExpenseReport" r
    JOIN "User" u ON u.id = r."employeeId"
    JOIN "LegalEntity" le ON le.id = r."legalEntityId"
    LEFT JOIN LATERAL (SELECT e."costCenterId" FROM "Expense" e WHERE e."reportId" = r.id LIMIT 1) e ON TRUE
    WHERE ${reportScope}${entityFilter}${countryFilter}${deptFilter}`;

  const violations = await prisma.$queryRaw<{ severity: string; action: string; n: bigint }[]>`
    SELECT v.severity::text, v.action::text, COUNT(*) AS n
    FROM "PolicyViolation" v
    JOIN "ExpenseReport" r ON r.id = v."reportId"
    JOIN "User" u ON u.id = r."employeeId"
    JOIN "LegalEntity" le ON le.id = r."legalEntityId"
    LEFT JOIN "Expense" e ON e.id = v."expenseId"
    WHERE ${reportScope}${entityFilter}${countryFilter}${deptFilter}
    GROUP BY 1, 2`;

  const reports = Number(kpi?.reports ?? 0);
  return {
    currency: group_.reportingCurrency,
    filters: f,
    totals: {
      amount: total.toDecimalPlaces(2).toNumber(),
      lines: count,
      reports,
      outOfPolicyLines: outOfPolicy,
      complianceRate: reports ? Math.round((Number(kpi.compliant) / reports) * 1000) / 10 : 100,
      avgCycleDays: kpi?.cycleDays != null ? Math.round(Number(kpi.cycleDays) * 10) / 10 : null,
      outstandingLiabilities: d(kpi?.liabilities ?? 0).toDecimalPlaces(2).toNumber(),
      pendingReview: Number(kpi?.pendingReview ?? 0),
    },
    byEntity: group(rows, (r) => r.legalEntityId, name(entities, (e) => `${e.code} · ${e.name}`)),
    byCountry: group(rows, (r) => r.countryCode, (k) => countries.find((c) => c.code === k)?.name ?? k),
    byDepartment: group(rows, (r) => String(r.departmentId), name(departments, (x) => `${x.legalEntity.code} · ${x.name}`)),
    byCostCenter: group(rows, (r) => r.costCenterId, name(costCenters, (x) => `${x.code} · ${x.name}`)).slice(0, 15),
    byCategory: group(rows, (r) => r.categoryId, name(categories, (x) => x.name)),
    byCurrency: [...byCurrency.values()].map((c) => ({ currency: c.currency, original: c.original.toDecimalPlaces(2).toNumber(), reporting: c.reporting.toDecimalPlaces(2).toNumber(), count: c.count })).sort((a, b) => b.reporting - a.reporting),
    trend: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ ...m, pending: Math.round(m.pending), approved: Math.round(m.approved), paid: Math.round(m.paid) })),
    violations: violations.map((v) => ({ severity: v.severity, action: v.action, count: Number(v.n) })),
  };
}

/** Budget vs actual consolidated in the reporting currency (functional budgets converted at today's rate). */
export async function budgetSummary(actor: Actor, fiscalYear: number, legalEntityId?: string) {
  if (!can(actor, "budget:read")) return null;
  const rows = await listBudgets(actor, { fiscalYear, legalEntityId });
  const group = await prisma.group.findUniqueOrThrow({ where: { id: actor.groupId } });
  const now = new Date();
  const fx = await loadFxTable(now, now);
  const conv = (v: Decimal, cur: string) => {
    try { return fx.convert(v, cur, group.reportingCurrency, now).amount.toNumber(); } catch { return cur === group.reportingCurrency ? v.toNumber() : NaN; }
  };
  const annual = rows.filter((r) => r.budget.month === null);
  const totals = annual.reduce(
    (acc, r) => ({
      budget: acc.budget + conv(r.indicators.current, r.budget.currency),
      actual: acc.actual + conv(r.indicators.actual, r.budget.currency),
      pending: acc.pending + conv(r.indicators.pending, r.budget.currency),
      forecast: acc.forecast + conv(r.indicators.forecastAtCompletion, r.budget.currency),
    }),
    { budget: 0, actual: 0, pending: 0, forecast: 0 },
  );
  return {
    currency: group.reportingCurrency,
    totals: { ...totals, consumptionPct: totals.budget ? Math.round(((totals.actual + (group.budgetBasis === "ACTUAL_AND_PENDING" ? totals.pending : 0)) / totals.budget) * 1000) / 10 : 0 },
    items: annual
      .map((r) => ({ code: r.budget.code, name: r.budget.name, entity: r.budget.legalEntity.code, budget: conv(r.indicators.current, r.budget.currency), actual: conv(r.indicators.actual, r.budget.currency), pending: conv(r.indicators.pending, r.budget.currency), forecast: conv(r.indicators.forecastAtCompletion, r.budget.currency), consumptionPct: r.indicators.consumptionPct, alertLevel: r.indicators.alertLevel }))
      .sort((a, b) => b.consumptionPct - a.consumptionPct),
  };
}

export async function employeeSummary(actor: Actor) {
  const [byStatus, recent, advances] = await Promise.all([
    prisma.expenseReport.groupBy({ by: ["status"], where: { employeeId: actor.id }, _sum: { totalFunctional: true, netPayable: true }, _count: { _all: true } }),
    prisma.expenseReport.findMany({ where: { employeeId: actor.id }, orderBy: { updatedAt: "desc" }, take: 8 }),
    prisma.advance.findMany({ where: { employeeId: actor.id, status: { in: ["PAID", "PARTIALLY_SETTLED"] } } }),
  ]);
  const entity = await prisma.legalEntity.findUniqueOrThrow({ where: { id: actor.legalEntityId } });
  const s = (statuses: string[], field: "totalFunctional" | "netPayable" = "totalFunctional") =>
    byStatus.filter((b) => statuses.includes(b.status)).reduce((acc, b) => acc.plus(d(b._sum[field] ?? 0)), new Decimal(0)).toNumber();
  const c = (statuses: string[]) => byStatus.filter((b) => statuses.includes(b.status)).reduce((acc, b) => acc + b._count._all, 0);
  return {
    currency: entity.functionalCurrency,
    submitted: s(["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED", "APPROVED", "READY_FOR_PAYMENT", "PAYMENT_INITIATED", "PAID"]),
    pending: { amount: s(["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED"]), count: c(["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED"]) },
    approved: { amount: s(["APPROVED", "READY_FOR_PAYMENT", "PAYMENT_INITIATED"]), count: c(["APPROVED", "READY_FOR_PAYMENT", "PAYMENT_INITIATED"]) },
    toBeReimbursed: s(["READY_FOR_PAYMENT", "PAYMENT_INITIATED"], "netPayable"),
    paid: { amount: s(["PAID"]), count: c(["PAID"]) },
    drafts: c(["DRAFT", "REJECTED"]),
    infoRequested: c(["INFO_REQUESTED"]),
    outstandingAdvances: advances.reduce((acc, a) => acc.plus(d(a.amount).minus(d(a.settledAmount))), new Decimal(0)).toNumber(),
    recent,
  };
}

export async function managerSummary(actor: Actor) {
  const tasks = await prisma.approvalTask.findMany({ where: { approverId: actor.id, status: "PENDING" }, select: { activatedAt: true, dueAt: true } });
  const now = Date.now();
  const age = (t: { activatedAt: Date | null }) => (now - (t.activatedAt?.getTime() ?? now)) / 86400_000;
  const aging = [
    { bucket: "< 1 day", count: tasks.filter((t) => age(t) < 1).length },
    { bucket: "1–3 days", count: tasks.filter((t) => age(t) >= 1 && age(t) < 3).length },
    { bucket: "3–7 days", count: tasks.filter((t) => age(t) >= 3 && age(t) < 7).length },
    { bucket: "> 7 days", count: tasks.filter((t) => age(t) >= 7).length },
  ];
  return { pending: tasks.length, overdue: tasks.filter((t) => t.dueAt && t.dueAt.getTime() < now).length, aging };
}
