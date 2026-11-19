import type { Budget } from "@prisma/client";
import { prisma, Prisma } from "../db";
import { bucketForStatus, budgetCovers, computeBudget, crossedThresholds, type BudgetIndicators } from "../domain/budget";
import { d, Decimal } from "../domain/money";
import { assertCan, scopeFor, scopeIncludesEntity, type Actor } from "../auth/scope";
import { forbidden } from "../errors";
import { audit } from "../infra/audit";
import { notify, runAfterCommit } from "./notification-service";

interface CubeCell {
  legalEntityId: string;
  month: number;
  departmentId: string | null;
  costCenterId: string;
  projectId: string | null;
  categoryId: string;
  status: string;
  amount: Decimal;
}

/**
 * Aggregates expense amounts (functional currency) into a small dimensional cube in SQL.
 * Each expense row is counted exactly once, in the bucket of its report's current status.
 */
export async function loadCube(entityIds: string[], year: number): Promise<CubeCell[]> {
  if (!entityIds.length) return [];
  const rows = await prisma.$queryRaw<
    { legalEntityId: string; month: number; departmentId: string | null; costCenterId: string; projectId: string | null; categoryId: string; status: string; amount: Prisma.Decimal }[]
  >`
    SELECT r."legalEntityId", EXTRACT(MONTH FROM e."expenseDate")::int AS month, u."departmentId",
           e."costCenterId", e."projectId", e."categoryId", r.status::text AS status,
           SUM(e."functionalAmount") AS amount
    FROM "Expense" e
    JOIN "ExpenseReport" r ON r.id = e."reportId"
    JOIN "User" u ON u.id = r."employeeId"
    WHERE r."legalEntityId" = ANY(${entityIds})
      AND e."expenseDate" >= make_date(${year}::int, 1, 1) AND e."expenseDate" < make_date(${year + 1}::int, 1, 1)
      AND r.status NOT IN ('DRAFT', 'REJECTED')
    GROUP BY 1, 2, 3, 4, 5, 6, 7`;
  return rows.map((r) => ({ ...r, amount: d(r.amount) }));
}

function monthsElapsed(budget: Pick<Budget, "fiscalYear" | "month">, now: Date): { elapsed: number; total: number } {
  if (budget.month !== null) {
    return { elapsed: now >= new Date(Date.UTC(budget.fiscalYear, budget.month - 1, 1)) ? 1 : 0, total: 1 };
  }
  if (now.getUTCFullYear() > budget.fiscalYear) return { elapsed: 12, total: 12 };
  if (now.getUTCFullYear() < budget.fiscalYear) return { elapsed: 0, total: 12 };
  return { elapsed: now.getUTCMonth() + 1, total: 12 };
}

export function indicatorsFor(budget: Budget, cells: CubeCell[], basis: "ACTUAL_ONLY" | "ACTUAL_AND_PENDING", extra: CubeCell[] = [], now = new Date()): BudgetIndicators {
  const totals = { pending: new Decimal(0), approved: new Decimal(0), paid: new Decimal(0) };
  for (const c of [...cells, ...extra]) {
    const dims = { legalEntityId: c.legalEntityId, expenseDate: new Date(Date.UTC(budget.fiscalYear, c.month - 1, 15)), departmentId: c.departmentId, costCenterId: c.costCenterId, projectId: c.projectId, categoryId: c.categoryId };
    if (!budgetCovers(budget, dims)) continue;
    const bucket = bucketForStatus(c.status);
    if (bucket !== "excluded") totals[bucket] = totals[bucket].plus(c.amount);
  }
  const { elapsed, total } = monthsElapsed(budget, now);
  return computeBudget({
    initial: budget.initialAmount,
    revised: budget.revisedAmount,
    ...totals,
    basis,
    monthsElapsed: elapsed,
    monthsTotal: total,
  });
}

export async function listBudgets(actor: Actor, filter: { legalEntityId?: string; fiscalYear: number }) {
  assertCan(actor, "budget:read");
  const scope = await scopeFor(actor, "budget:read");
  const where: Prisma.BudgetWhereInput = { fiscalYear: filter.fiscalYear, legalEntity: { groupId: actor.groupId } };
  const or: Prisma.BudgetWhereInput[] = [];
  if (scope.all) or.push({});
  if (scope.entityIds.size) or.push({ legalEntityId: { in: [...scope.entityIds] } });
  if (scope.departmentIds.size) or.push({ departmentId: { in: [...scope.departmentIds] } });
  if (scope.costCenterIds.size) or.push({ costCenterId: { in: [...scope.costCenterIds] } });
  if (!or.length) return [];
  where.OR = or;
  if (filter.legalEntityId) where.legalEntityId = filter.legalEntityId;

  const budgets = await prisma.budget.findMany({
    where,
    include: { legalEntity: { include: { group: true } }, department: true, costCenter: true, project: true, category: true },
    orderBy: [{ legalEntityId: "asc" }, { code: "asc" }],
  });
  const entityIds = [...new Set(budgets.map((b) => b.legalEntityId))];
  const cube = await loadCube(entityIds, filter.fiscalYear);
  return budgets.map((b) => ({ budget: b, indicators: indicatorsFor(b, cube, b.legalEntity.group.budgetBasis) }));
}

/**
 * For the lines of a report about to be submitted, returns the budgets that would exceed 100%
 * once this report is counted (used by the BUDGET_OVERRUN policy control).
 */
export async function projectedOverruns(report: {
  legalEntityId: string;
  departmentId: string | null;
  basis: "ACTUAL_ONLY" | "ACTUAL_AND_PENDING";
  lines: { id: string; expenseDate: Date; costCenterId: string; projectId: string | null; categoryId: string; functionalAmount: Decimal }[];
}): Promise<Map<string, { budgetCode: string; consumptionPct: number }[]>> {
  const result = new Map<string, { budgetCode: string; consumptionPct: number }[]>();
  const years = [...new Set(report.lines.map((l) => l.expenseDate.getUTCFullYear()))];
  for (const year of years) {
    const budgets = await prisma.budget.findMany({ where: { legalEntityId: report.legalEntityId, fiscalYear: year } });
    if (!budgets.length) continue;
    const cube = await loadCube([report.legalEntityId], year);
    const lines = report.lines.filter((l) => l.expenseDate.getUTCFullYear() === year);
    // Simulate this report as "pending" and, for ACTUAL_ONLY budgets, as "approved" (the eventual outcome)
    const asStatus = report.basis === "ACTUAL_ONLY" ? "APPROVED" : "SUBMITTED";
    const extra: CubeCell[] = lines.map((l) => ({
      legalEntityId: report.legalEntityId, month: l.expenseDate.getUTCMonth() + 1, departmentId: report.departmentId,
      costCenterId: l.costCenterId, projectId: l.projectId, categoryId: l.categoryId, status: asStatus, amount: l.functionalAmount,
    }));
    for (const b of budgets) {
      const ind = indicatorsFor(b, cube, report.basis, extra);
      if (ind.consumptionPct < 100) continue;
      for (const l of lines) {
        const covers = budgetCovers(b, { legalEntityId: report.legalEntityId, expenseDate: l.expenseDate, departmentId: report.departmentId, costCenterId: l.costCenterId, projectId: l.projectId, categoryId: l.categoryId });
        if (covers) result.set(l.id, [...(result.get(l.id) ?? []), { budgetCode: b.code, consumptionPct: ind.consumptionPct }]);
      }
    }
  }
  return result;
}

/** Raises one-shot alerts at 80/90/100% and notifies finance controllers of the entity. */
export async function checkBudgetAlerts(legalEntityId: string, fiscalYear: number) {
  const budgets = await prisma.budget.findMany({ where: { legalEntityId, fiscalYear }, include: { alerts: true, legalEntity: { include: { group: true } } } });
  if (!budgets.length) return;
  const cube = await loadCube([legalEntityId], fiscalYear);
  const senders: (() => Promise<void>)[] = [];
  for (const b of budgets) {
    const ind = indicatorsFor(b, cube, b.legalEntity.group.budgetBasis);
    const already = Math.max(0, ...b.alerts.map((a) => a.threshold));
    const crossed = crossedThresholds(already, ind.consumptionPct).filter((t) => !b.alerts.some((a) => a.threshold === t));
    if (!crossed.length) continue;
    for (const t of crossed) {
      await prisma.budgetAlert.upsert({
        where: { budgetId_threshold: { budgetId: b.id, threshold: t } },
        create: { budgetId: b.id, threshold: t, consumption: ind.consumptionPct },
        update: {},
      });
    }
    const top = Math.max(...crossed);
    const controllers = await prisma.roleAssignment.findMany({
      where: {
        role: { in: ["FINANCE_CONTROLLER", "LOCAL_FINANCE"] },
        OR: [{ scopeType: "LEGAL_ENTITY", scopeId: legalEntityId }, { scopeType: "COUNTRY", scopeId: b.legalEntity.countryCode }],
      },
      select: { userId: true },
    });
    const managerIds = b.departmentId ? (await prisma.department.findUnique({ where: { id: b.departmentId } }))?.managerId : null;
    senders.push(
      await notify({
        userIds: [...controllers.map((c) => c.userId), ...(managerIds ? [managerIds] : [])],
        type: "BUDGET_THRESHOLD",
        title: `Budget ${b.code} reached ${top}%`,
        body: `${b.name} (${b.legalEntity.code}, FY${b.fiscalYear}) consumption is ${ind.consumptionPct.toFixed(1)}% — remaining ${ind.remaining.toFixed(2)} ${b.currency}.`,
        link: `/budgets?year=${fiscalYear}`,
      }),
    );
  }
  await runAfterCommit(senders);
}

export async function upsertBudget(actor: Actor, input: {
  legalEntityId: string; code: string; name: string; fiscalYear: number; month?: number | null; departmentId?: string | null;
  costCenterId?: string | null; projectId?: string | null; categoryId?: string | null; initialAmount: string; revisedAmount?: string | null;
}) {
  assertCan(actor, "budget:manage");
  const scope = await scopeFor(actor, "budget:manage");
  if (!scopeIncludesEntity(scope, input.legalEntityId)) throw forbidden("You cannot manage budgets for this entity");
  const entity = await prisma.legalEntity.findUniqueOrThrow({ where: { id: input.legalEntityId } });
  const data = {
    name: input.name,
    month: input.month ?? null,
    departmentId: input.departmentId ?? null,
    costCenterId: input.costCenterId ?? null,
    projectId: input.projectId ?? null,
    categoryId: input.categoryId ?? null,
    initialAmount: input.initialAmount,
    revisedAmount: input.revisedAmount ?? null,
    currency: entity.functionalCurrency,
  };
  const existing = await prisma.budget.findUnique({ where: { legalEntityId_code_fiscalYear: { legalEntityId: input.legalEntityId, code: input.code, fiscalYear: input.fiscalYear } } });
  const budget = await prisma.budget.upsert({
    where: { legalEntityId_code_fiscalYear: { legalEntityId: input.legalEntityId, code: input.code, fiscalYear: input.fiscalYear } },
    create: { ...data, legalEntityId: input.legalEntityId, code: input.code, fiscalYear: input.fiscalYear },
    update: data,
  });
  await audit(actor, {
    action: existing ? "budget.updated" : "budget.created",
    entityType: "Budget",
    entityId: budget.id,
    legalEntityId: budget.legalEntityId,
    data: { before: existing ? { initial: existing.initialAmount.toString(), revised: existing.revisedAmount?.toString() ?? null } : null, after: { initial: input.initialAmount, revised: input.revisedAmount ?? null } },
  });
  return budget;
}
