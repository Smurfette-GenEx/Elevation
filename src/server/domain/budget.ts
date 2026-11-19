import { Decimal, d, type DecimalLike } from "./money";

export type BudgetBasis = "ACTUAL_ONLY" | "ACTUAL_AND_PENDING";

/**
 * Each expense is counted in EXACTLY ONE bucket, derived from its report's current status:
 *   pending  = SUBMITTED | UNDER_REVIEW | INFO_REQUESTED
 *   approved = APPROVED | READY_FOR_PAYMENT | PAYMENT_INITIATED
 *   paid     = PAID
 * Buckets are computed from live status (never accumulated counters), which makes
 * double counting structurally impossible when a report moves from one status to the next.
 */
export type ConsumptionBucket = "pending" | "approved" | "paid" | "excluded";

export function bucketForStatus(status: string): ConsumptionBucket {
  switch (status) {
    case "SUBMITTED":
    case "UNDER_REVIEW":
    case "INFO_REQUESTED":
      return "pending";
    case "APPROVED":
    case "READY_FOR_PAYMENT":
    case "PAYMENT_INITIATED":
      return "approved";
    case "PAID":
      return "paid";
    default:
      return "excluded"; // DRAFT, REJECTED
  }
}

export interface BudgetInputs {
  initial: DecimalLike;
  revised: DecimalLike | null;
  pending: DecimalLike;
  approved: DecimalLike;
  paid: DecimalLike;
  basis: BudgetBasis;
  /** months elapsed in the budget period (for run-rate forecast) */
  monthsElapsed: number;
  monthsTotal: number;
}

export interface BudgetIndicators {
  initial: Decimal;
  revised: Decimal;
  current: Decimal; // revised if set else initial
  pending: Decimal;
  approved: Decimal; // approved but not yet paid
  paid: Decimal;
  actual: Decimal; // approved + paid
  consumed: Decimal; // per basis
  remaining: Decimal;
  consumptionPct: number;
  forecastAtCompletion: Decimal;
  variance: Decimal; // current - forecast (positive = under budget)
  variancePct: number;
  alertLevel: 0 | 80 | 90 | 100;
}

export const ALERT_THRESHOLDS = [80, 90, 100] as const;

export function alertLevelFor(pct: number): 0 | 80 | 90 | 100 {
  if (pct >= 100) return 100;
  if (pct >= 90) return 90;
  if (pct >= 80) return 80;
  return 0;
}

export function computeBudget(i: BudgetInputs): BudgetIndicators {
  const initial = d(i.initial);
  const revised = i.revised === null ? initial : d(i.revised);
  const pending = d(i.pending);
  const approved = d(i.approved);
  const paid = d(i.paid);
  const actual = approved.plus(paid);
  const consumed = i.basis === "ACTUAL_AND_PENDING" ? actual.plus(pending) : actual;
  const remaining = revised.minus(consumed);
  const pct = revised.isZero() ? (consumed.isZero() ? 0 : 100) : consumed.dividedBy(revised).times(100).toNumber();

  // Forecast at completion: committed spend + linear run-rate of actuals for remaining months.
  const elapsed = Math.min(Math.max(i.monthsElapsed, 0), i.monthsTotal);
  const remainingMonths = i.monthsTotal - elapsed;
  const runRate = elapsed > 0 ? actual.dividedBy(elapsed) : new Decimal(0);
  const forecast = actual.plus(pending).plus(runRate.times(remainingMonths));
  const variance = revised.minus(forecast);

  return {
    initial,
    revised,
    current: revised,
    pending,
    approved,
    paid,
    actual,
    consumed,
    remaining,
    consumptionPct: Math.round(pct * 100) / 100,
    forecastAtCompletion: forecast.toDecimalPlaces(2),
    variance: variance.toDecimalPlaces(2),
    variancePct: revised.isZero() ? 0 : Math.round(variance.dividedBy(revised).times(10000).toNumber()) / 100,
    alertLevel: alertLevelFor(pct),
  };
}

/** Thresholds crossed when moving from one consumption % to another (for one-shot alerts). */
export function crossedThresholds(beforePct: number, afterPct: number): number[] {
  return ALERT_THRESHOLDS.filter((t) => beforePct < t && afterPct >= t);
}

export interface BudgetScope {
  legalEntityId: string;
  fiscalYear: number;
  month: number | null;
  departmentId: string | null;
  costCenterId: string | null;
  projectId: string | null;
  categoryId: string | null;
}

export interface ExpenseDims {
  legalEntityId: string;
  expenseDate: Date;
  departmentId: string | null;
  costCenterId: string;
  projectId: string | null;
  categoryId: string;
}

/** Whether an expense falls inside a budget's dimensional scope. Null dimensions = all. */
export function budgetCovers(b: BudgetScope, e: ExpenseDims): boolean {
  if (b.legalEntityId !== e.legalEntityId) return false;
  if (e.expenseDate.getUTCFullYear() !== b.fiscalYear) return false;
  if (b.month !== null && e.expenseDate.getUTCMonth() + 1 !== b.month) return false;
  if (b.departmentId && b.departmentId !== e.departmentId) return false;
  if (b.costCenterId && b.costCenterId !== e.costCenterId) return false;
  if (b.projectId && b.projectId !== e.projectId) return false;
  if (b.categoryId && b.categoryId !== e.categoryId) return false;
  return true;
}
