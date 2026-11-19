import { Decimal, d, roundMoney, type DecimalLike } from "./money";
import { daysBetween, isoDate } from "./dates";

export type PolicyRuleType =
  | "CATEGORY_MAX_PER_ITEM"
  | "DAILY_MEAL_ALLOWANCE"
  | "ACCOMMODATION_NIGHTLY_MAX"
  | "RECEIPT_REQUIRED_ABOVE"
  | "WEEKEND_EXPENSE"
  | "PUBLIC_HOLIDAY_EXPENSE"
  | "DUPLICATE_EXPENSE"
  | "DUPLICATE_RECEIPT"
  | "CATEGORY_NOT_ALLOWED"
  | "UNUSUAL_AMOUNT"
  | "BUDGET_OVERRUN"
  | "LATE_SUBMISSION"
  | "MISSING_DESCRIPTION";

export type PolicyAction = "BLOCK" | "WARN" | "REQUIRE_EXCEPTION";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface PolicyRuleInput {
  id: string;
  name: string;
  type: PolicyRuleType;
  countryCode: string | null;
  legalEntityId: string | null;
  categoryId: string | null;
  params: Record<string, unknown>;
  currency: string | null;
  action: PolicyAction;
  severity: Severity;
  priority: number;
}

export interface PolicyLineInput {
  id: string;
  lineNo: number;
  expenseDate: Date;
  categoryId: string;
  categoryName: string;
  isMeal: boolean;
  isAccommodation: boolean;
  isMileage: boolean;
  countryCode: string;
  merchant: string;
  description: string;
  currency: string;
  grossAmount: DecimalLike;
  reportingAmount: DecimalLike; // in group reporting currency
  nights?: number | null;
  hasReceipt: boolean;
  receiptSha256?: string | null;
  fingerprint: string;
  costCenterId: string;
  projectId?: string | null;
}

export interface PolicyContext {
  legalEntityId: string;
  countryCode: string; // employee's country
  reportingCurrency: string;
  submissionDate: Date;
  weekendDaysByCountry: Record<string, number[]>;
  holidays: { countryCode: string; date: string; name: string }[]; // date = YYYY-MM-DD
  /** fingerprints of expenses in OTHER non-rejected reports of the same employee */
  existingFingerprints: Map<string, string>; // fingerprint -> report number
  /** receipt hashes used on OTHER expenses (any employee in the group) */
  existingReceiptHashes: Map<string, string>; // sha256 -> report number
  /** historical average reporting amount per category (for unusual-spend detection) */
  categoryStats: Map<string, { avg: DecimalLike; count: number }>;
  /** budget projections for lines: lineId -> budgets that would exceed 100% */
  budgetOverruns: Map<string, { budgetCode: string; consumptionPct: number }[]>;
  /** converts an amount from currency A to B at a date (rule thresholds may be in another currency) */
  convert: (amount: DecimalLike, from: string, to: string, date: Date) => Decimal;
}

export interface PolicyFinding {
  ruleId: string;
  ruleType: PolicyRuleType;
  expenseId: string | null;
  action: PolicyAction;
  severity: Severity;
  message: string;
}

export interface PolicyResult {
  findings: PolicyFinding[];
  blocking: PolicyFinding[];
  exceptions: PolicyFinding[];
  warnings: PolicyFinding[];
  canSubmit: boolean;
}

/** Specificity score: entity > country > category. */
function specificity(r: PolicyRuleInput): number {
  return (r.legalEntityId ? 4 : 0) + (r.countryCode ? 2 : 0) + (r.categoryId ? 1 : 0);
}

function ruleMatches(rule: PolicyRuleInput, ctx: PolicyContext, line?: PolicyLineInput): boolean {
  if (rule.legalEntityId && rule.legalEntityId !== ctx.legalEntityId) return false;
  if (rule.countryCode && rule.countryCode !== ctx.countryCode && rule.countryCode !== line?.countryCode) return false;
  if (rule.categoryId && line && rule.categoryId !== line.categoryId) return false;
  return true;
}

/**
 * For a given type, pick the single most specific applicable rule per line
 * (an entity-level meal allowance overrides the group default, etc.).
 */
function pickRule(rules: PolicyRuleInput[], type: PolicyRuleType, ctx: PolicyContext, line?: PolicyLineInput) {
  return rules
    .filter((r) => r.type === type && ruleMatches(r, ctx, line))
    .sort((a, b) => specificity(b) - specificity(a) || b.priority - a.priority)[0];
}

function num(params: Record<string, unknown>, key: string, fallback?: number): number | undefined {
  const v = params[key];
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function amountIn(ctx: PolicyContext, line: PolicyLineInput, currency: string | null): Decimal {
  const target = currency ?? line.currency;
  return ctx.convert(line.grossAmount, line.currency, target, line.expenseDate);
}

function fmt(amount: DecimalLike, currency: string) {
  return `${roundMoney(amount, currency).toFixed(2)} ${currency}`;
}

export function evaluatePolicies(rules: PolicyRuleInput[], ctx: PolicyContext, lines: PolicyLineInput[]): PolicyResult {
  const findings: PolicyFinding[] = [];
  const add = (rule: PolicyRuleInput, line: PolicyLineInput | null, message: string) =>
    findings.push({ ruleId: rule.id, ruleType: rule.type, expenseId: line?.id ?? null, action: rule.action, severity: rule.severity, message });

  for (const line of lines) {
    const label = `Line ${line.lineNo} (${line.categoryName}, ${isoDate(line.expenseDate)})`;

    // Unauthorized category
    const notAllowed = pickRule(rules, "CATEGORY_NOT_ALLOWED", ctx, line);
    if (notAllowed && notAllowed.categoryId === line.categoryId) {
      add(notAllowed, line, `${label}: category "${line.categoryName}" is not authorised for this entity`);
    }

    // Per-item maximum
    const maxRule = pickRule(rules, "CATEGORY_MAX_PER_ITEM", ctx, line);
    const max = maxRule && num(maxRule.params, "maxAmount");
    if (maxRule && max !== undefined) {
      const cur = maxRule.currency ?? line.currency;
      const amt = amountIn(ctx, line, cur);
      if (amt.greaterThan(max)) add(maxRule, line, `${label}: ${fmt(amt, cur)} exceeds the per-item limit of ${fmt(max, cur)}`);
    }

    // Accommodation nightly cap
    if (line.isAccommodation) {
      const r = pickRule(rules, "ACCOMMODATION_NIGHTLY_MAX", ctx, line);
      const cap = r && num(r.params, "maxAmount");
      if (r && cap !== undefined) {
        const cur = r.currency ?? line.currency;
        const nights = Math.max(1, line.nights ?? 1);
        const perNight = amountIn(ctx, line, cur).dividedBy(nights);
        if (perNight.greaterThan(cap)) {
          add(r, line, `${label}: ${fmt(perNight, cur)} per night exceeds the accommodation cap of ${fmt(cap, cur)} (${nights} night(s))`);
        }
      }
    }

    // Receipt threshold (mileage is supported by distance, not receipts)
    if (!line.isMileage && !line.hasReceipt) {
      const r = pickRule(rules, "RECEIPT_REQUIRED_ABOVE", ctx, line);
      const threshold = r ? num(r.params, "threshold", 0)! : undefined;
      if (r && threshold !== undefined) {
        const cur = r.currency ?? line.currency;
        const amt = amountIn(ctx, line, cur);
        if (amt.greaterThanOrEqualTo(threshold)) add(r, line, `${label}: receipt is mandatory above ${fmt(threshold, cur)}`);
      }
    }

    // Weekend
    const weekend = pickRule(rules, "WEEKEND_EXPENSE", ctx, line);
    if (weekend) {
      const days = ctx.weekendDaysByCountry[line.countryCode] ?? [0, 6];
      if (days.includes(line.expenseDate.getUTCDay())) add(weekend, line, `${label}: expense incurred on a weekend`);
    }

    // Public holiday (in the country where incurred)
    const holidayRule = pickRule(rules, "PUBLIC_HOLIDAY_EXPENSE", ctx, line);
    if (holidayRule) {
      const h = ctx.holidays.find((x) => x.countryCode === line.countryCode && x.date === isoDate(line.expenseDate));
      if (h) add(holidayRule, line, `${label}: expense incurred on a public holiday (${h.name})`);
    }

    // Duplicate expense in other reports
    const dupRule = pickRule(rules, "DUPLICATE_EXPENSE", ctx, line);
    if (dupRule) {
      const other = ctx.existingFingerprints.get(line.fingerprint);
      if (other) add(dupRule, line, `${label}: possible duplicate of an expense already claimed in report ${other}`);
    }

    // Duplicate receipt document
    const dupReceipt = pickRule(rules, "DUPLICATE_RECEIPT", ctx, line);
    if (dupReceipt && line.receiptSha256) {
      const other = ctx.existingReceiptHashes.get(line.receiptSha256);
      if (other) add(dupReceipt, line, `${label}: the same receipt file was already used in report ${other}`);
    }

    // Unusual amount vs historical category average
    const unusual = pickRule(rules, "UNUSUAL_AMOUNT", ctx, line);
    if (unusual) {
      const stats = ctx.categoryStats.get(line.categoryId);
      const multiplier = num(unusual.params, "multiplier", 3)!;
      const minSamples = num(unusual.params, "minSamples", 5)!;
      if (stats && stats.count >= minSamples && d(stats.avg).greaterThan(0)) {
        const ratio = d(line.reportingAmount).dividedBy(d(stats.avg));
        if (ratio.greaterThan(multiplier)) {
          add(unusual, line, `${label}: amount is ${ratio.toFixed(1)}x the historical average for this category`);
        }
      }
    }

    // Late submission
    const late = pickRule(rules, "LATE_SUBMISSION", ctx, line);
    const maxDays = late && num(late.params, "maxDaysAfter");
    if (late && maxDays !== undefined) {
      const age = daysBetween(line.expenseDate, ctx.submissionDate);
      if (age > maxDays) add(late, line, `${label}: submitted ${age} days after the expense (limit ${maxDays})`);
    }

    // Description quality
    const desc = pickRule(rules, "MISSING_DESCRIPTION", ctx, line);
    if (desc) {
      const minLength = num(desc.params, "minLength", 5)!;
      if (line.description.trim().length < minLength) add(desc, line, `${label}: business purpose description is missing or too short`);
    }

    // Budget overrun
    const budgetRule = pickRule(rules, "BUDGET_OVERRUN", ctx, line);
    const overruns = ctx.budgetOverruns.get(line.id);
    if (budgetRule && overruns?.length) {
      for (const o of overruns) add(budgetRule, line, `${label}: budget ${o.budgetCode} would reach ${o.consumptionPct.toFixed(0)}% consumption`);
    }
  }

  // Duplicates inside the same report
  const seen = new Map<string, PolicyLineInput>();
  for (const line of lines) {
    const prev = seen.get(line.fingerprint);
    const dupRule = pickRule(rules, "DUPLICATE_EXPENSE", ctx, line);
    if (prev && dupRule) add(dupRule, line, `Line ${line.lineNo} duplicates line ${prev.lineNo} in this report`);
    else seen.set(line.fingerprint, line);
  }

  // Daily meal allowance: aggregate meals per calendar day
  const mealsByDay = new Map<string, PolicyLineInput[]>();
  for (const line of lines.filter((l) => l.isMeal)) {
    const k = isoDate(line.expenseDate);
    mealsByDay.set(k, [...(mealsByDay.get(k) ?? []), line]);
  }
  for (const [day, dayLines] of mealsByDay) {
    const r = pickRule(rules, "DAILY_MEAL_ALLOWANCE", ctx, dayLines[0]);
    const cap = r && num(r.params, "maxAmount");
    if (!r || cap === undefined) continue;
    const cur = r.currency ?? ctx.reportingCurrency;
    const total = dayLines.reduce((acc, l) => acc.plus(amountIn(ctx, l, cur)), new Decimal(0));
    if (total.greaterThan(cap)) {
      add(r, dayLines[dayLines.length - 1], `Meals on ${day} total ${fmt(total, cur)}, above the daily allowance of ${fmt(cap, cur)}`);
    }
  }

  return {
    findings,
    blocking: findings.filter((f) => f.action === "BLOCK"),
    exceptions: findings.filter((f) => f.action === "REQUIRE_EXCEPTION"),
    warnings: findings.filter((f) => f.action === "WARN"),
    canSubmit: !findings.some((f) => f.action === "BLOCK"),
  };
}
