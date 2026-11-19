import { describe, it, expect } from "vitest";
import { evaluatePolicies, type PolicyRuleInput, type PolicyContext, type PolicyLineInput } from "@/server/domain/policy-engine";
import { FxTable } from "@/server/domain/fx";

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const fx = new FxTable([{ baseCurrency: "EUR", quoteCurrency: "USD", rate: "1.10", effectiveDate: day("2026-03-15"), source: "ECB" }, { baseCurrency: "EUR", quoteCurrency: "USD", rate: "1.10", effectiveDate: day("2026-04-28"), source: "ECB" }, { baseCurrency: "EUR", quoteCurrency: "USD", rate: "1.10", effectiveDate: day("2025-11-28"), source: "ECB" }]);
let rid = 0;
const rule = (p: Partial<PolicyRuleInput> & Pick<PolicyRuleInput, "type" | "action">): PolicyRuleInput => ({
  id: `r${++rid}`, name: p.type, countryCode: null, legalEntityId: null, categoryId: null, params: {}, currency: "EUR", severity: "MEDIUM", priority: 0, ...p,
});
const ctx = (over: Partial<PolicyContext> = {}): PolicyContext => ({
  legalEntityId: "FR01", countryCode: "FR", reportingCurrency: "EUR", submissionDate: day("2026-03-20"),
  weekendDaysByCountry: { FR: [0, 6], AE: [5, 6] }, holidays: [{ countryCode: "FR", date: "2026-05-01", name: "Fête du Travail" }],
  existingFingerprints: new Map(), existingReceiptHashes: new Map(), categoryStats: new Map(), budgetOverruns: new Map(),
  convert: (a, f, t, dt) => fx.convert(a, f, t, dt).amount, ...over,
});
let lid = 0;
const line = (p: Partial<PolicyLineInput> = {}): PolicyLineInput => ({
  id: `l${++lid}`, lineNo: lid, expenseDate: day("2026-03-18"), categoryId: "MEALS", categoryName: "Meals", isMeal: false, isAccommodation: false, isMileage: false,
  countryCode: "FR", merchant: "Bistro", description: "Client lunch with ACME", currency: "EUR", grossAmount: "50", reportingAmount: "50",
  hasReceipt: true, fingerprint: `fp${lid}`, costCenterId: "cc1", ...p,
});

describe("policy engine", () => {
  it("applies the most specific rule (entity overrides group)", () => {
    const rules = [
      rule({ type: "CATEGORY_MAX_PER_ITEM", action: "WARN", categoryId: "MEALS", params: { maxAmount: 100 } }),
      rule({ type: "CATEGORY_MAX_PER_ITEM", action: "BLOCK", categoryId: "MEALS", legalEntityId: "FR01", params: { maxAmount: 40 } }),
    ];
    const r = evaluatePolicies(rules, ctx(), [line({ grossAmount: "50" })]);
    expect(r.findings).toHaveLength(1);
    expect(r.blocking).toHaveLength(1);
    expect(r.canSubmit).toBe(false);
  });

  it("converts amounts to the rule currency before comparing", () => {
    const rules = [rule({ type: "CATEGORY_MAX_PER_ITEM", action: "WARN", categoryId: "MEALS", currency: "EUR", params: { maxAmount: 100 } })];
    // 105 USD = 115.5 EUR? no: 1 EUR = 1.10 USD, so 105 USD = 95.45 EUR -> within limit
    expect(evaluatePolicies(rules, ctx(), [line({ currency: "USD", grossAmount: "105" })]).findings).toHaveLength(0);
    expect(evaluatePolicies(rules, ctx(), [line({ currency: "USD", grossAmount: "115" })]).findings).toHaveLength(1);
  });

  it("aggregates meals per day against the daily allowance", () => {
    const rules = [rule({ type: "DAILY_MEAL_ALLOWANCE", action: "REQUIRE_EXCEPTION", params: { maxAmount: 60 } })];
    const r = evaluatePolicies(rules, ctx(), [line({ isMeal: true, grossAmount: "35" }), line({ isMeal: true, grossAmount: "30" }), line({ isMeal: true, grossAmount: "30", expenseDate: day("2026-03-17") })]);
    expect(r.exceptions).toHaveLength(1);
    expect(r.canSubmit).toBe(true);
  });

  it("checks accommodation per night", () => {
    const rules = [rule({ type: "ACCOMMODATION_NIGHTLY_MAX", action: "REQUIRE_EXCEPTION", params: { maxAmount: 180 } })];
    expect(evaluatePolicies(rules, ctx(), [line({ isAccommodation: true, grossAmount: "500", nights: 3 })]).findings).toHaveLength(0);
    expect(evaluatePolicies(rules, ctx(), [line({ isAccommodation: true, grossAmount: "500", nights: 2 })]).findings).toHaveLength(1);
  });

  it("requires receipts above threshold, but not for mileage", () => {
    const rules = [rule({ type: "RECEIPT_REQUIRED_ABOVE", action: "BLOCK", severity: "HIGH", params: { threshold: 25 } })];
    const r = evaluatePolicies(rules, ctx(), [line({ hasReceipt: false, grossAmount: "30" }), line({ hasReceipt: false, grossAmount: "10" }), line({ hasReceipt: false, isMileage: true, grossAmount: "80" })]);
    expect(r.blocking).toHaveLength(1);
  });

  it("flags weekends using the country's weekend days and public holidays", () => {
    const rules = [rule({ type: "WEEKEND_EXPENSE", action: "WARN" }), rule({ type: "PUBLIC_HOLIDAY_EXPENSE", action: "WARN" })];
    const sat = line({ expenseDate: day("2026-03-21") });
    const uaeFriday = line({ expenseDate: day("2026-03-20"), countryCode: "AE" });
    const mayDay = line({ expenseDate: day("2026-05-01") });
    const r = evaluatePolicies(rules, ctx(), [sat, uaeFriday, mayDay]);
    expect(r.findings.map((f) => f.expenseId)).toEqual([sat.id, uaeFriday.id, mayDay.id]);
  });

  it("detects duplicates within the report, across reports and by receipt hash", () => {
    const rules = [rule({ type: "DUPLICATE_EXPENSE", action: "REQUIRE_EXCEPTION", severity: "HIGH" }), rule({ type: "DUPLICATE_RECEIPT", action: "BLOCK", severity: "CRITICAL" })];
    const c = ctx({ existingFingerprints: new Map([["dupX", "FR01-2026-000001"]]), existingReceiptHashes: new Map([["hash1", "FR01-2026-000002"]]) });
    const r = evaluatePolicies(rules, c, [line({ fingerprint: "same" }), line({ fingerprint: "same" }), line({ fingerprint: "dupX" }), line({ receiptSha256: "hash1" })]);
    expect(r.exceptions).toHaveLength(2);
    expect(r.blocking).toHaveLength(1);
  });

  it("detects unusual amounts only with enough history", () => {
    const rules = [rule({ type: "UNUSUAL_AMOUNT", action: "WARN", params: { multiplier: 3, minSamples: 5 } })];
    const stats = new Map([["MEALS", { avg: "40", count: 10 }]]);
    expect(evaluatePolicies(rules, ctx({ categoryStats: stats }), [line({ reportingAmount: "130" })]).findings).toHaveLength(1);
    expect(evaluatePolicies(rules, ctx({ categoryStats: new Map([["MEALS", { avg: "40", count: 2 }]]) }), [line({ reportingAmount: "130" })]).findings).toHaveLength(0);
  });

  it("flags late submission, missing description, unauthorized category and budget overruns", () => {
    const rules = [
      rule({ type: "LATE_SUBMISSION", action: "WARN", params: { maxDaysAfter: 60 } }),
      rule({ type: "MISSING_DESCRIPTION", action: "BLOCK", params: { minLength: 5 } }),
      rule({ type: "CATEGORY_NOT_ALLOWED", action: "BLOCK", categoryId: "GIFTS", legalEntityId: "FR01" }),
      rule({ type: "BUDGET_OVERRUN", action: "REQUIRE_EXCEPTION", severity: "HIGH" }),
    ];
    const old = line({ expenseDate: day("2025-12-01") });
    const noDesc = line({ description: "x" });
    const gift = line({ categoryId: "GIFTS", categoryName: "Gifts" });
    const overBudget = line();
    const r = evaluatePolicies(rules, ctx({ budgetOverruns: new Map([[overBudget.id, [{ budgetCode: "FR-MKT", consumptionPct: 104 }]]]) }), [old, noDesc, gift, overBudget]);
    expect(r.warnings).toHaveLength(1);
    expect(r.blocking).toHaveLength(2);
    expect(r.exceptions[0].message).toContain("FR-MKT");
  });

  it("ignores rules scoped to another entity or country", () => {
    const rules = [rule({ type: "WEEKEND_EXPENSE", action: "BLOCK", legalEntityId: "UK01" }), rule({ type: "WEEKEND_EXPENSE", action: "BLOCK", countryCode: "GB" })];
    expect(evaluatePolicies(rules, ctx(), [line({ expenseDate: day("2026-03-21") })]).findings).toHaveLength(0);
  });
});
