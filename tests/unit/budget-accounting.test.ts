import { describe, it, expect } from "vitest";
import { computeBudget, bucketForStatus, crossedThresholds, budgetCovers } from "@/server/domain/budget";
import { buildExpenseJournal, buildPaymentJournal, resolvePostingPeriod, AccountingError, type EntityAccounts } from "@/server/domain/accounting";
import { LAYOUTS } from "@/server/domain/erp-formats";
import { sum } from "@/server/domain/money";
import { toCsv, csvCell } from "@/server/domain/csv";
import { parseReceiptText } from "@/server/domain/receipt-parser";
import { expenseFingerprint, normalizeMerchant } from "@/server/domain/duplicates";
import { findMileageRate, mileageAmount } from "@/server/domain/mileage";

const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe("budget", () => {
  it("assigns each status to exactly one consumption bucket", () => {
    expect(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED", "APPROVED", "READY_FOR_PAYMENT", "PAYMENT_INITIATED", "PAID", "REJECTED"].map(bucketForStatus))
      .toEqual(["excluded", "pending", "pending", "pending", "approved", "approved", "approved", "paid", "excluded"]);
  });
  it("computes indicators per basis with run-rate forecast", () => {
    const b = computeBudget({ initial: "12000", revised: "10000", pending: "1000", approved: "2000", paid: "3000", basis: "ACTUAL_AND_PENDING", monthsElapsed: 5, monthsTotal: 12 });
    expect(b.actual.toString()).toBe("5000");
    expect(b.consumed.toString()).toBe("6000");
    expect(b.remaining.toString()).toBe("4000");
    expect(b.consumptionPct).toBe(60);
    expect(b.forecastAtCompletion.toString()).toBe("13000"); // 5000 + 1000 + 1000*7
    expect(b.variance.toString()).toBe("-3000");
    const actualOnly = computeBudget({ initial: "10000", revised: null, pending: "1000", approved: "7000", paid: "1500", basis: "ACTUAL_ONLY", monthsElapsed: 12, monthsTotal: 12 });
    expect(actualOnly.consumptionPct).toBe(85);
    expect(actualOnly.alertLevel).toBe(80);
  });
  it("reports thresholds crossed only once", () => {
    expect(crossedThresholds(75, 95)).toEqual([80, 90]);
    expect(crossedThresholds(95, 101)).toEqual([100]);
    expect(crossedThresholds(101, 120)).toEqual([]);
  });
  it("matches expenses to budget dimensions", () => {
    const b = { legalEntityId: "FR01", fiscalYear: 2026, month: 3, departmentId: null, costCenterId: "cc1", projectId: null, categoryId: null };
    const e = { legalEntityId: "FR01", expenseDate: day("2026-03-15"), departmentId: "d1", costCenterId: "cc1", projectId: null, categoryId: "MEALS" };
    expect(budgetCovers(b, e)).toBe(true);
    expect(budgetCovers(b, { ...e, expenseDate: day("2026-04-01") })).toBe(false);
    expect(budgetCovers(b, { ...e, costCenterId: "cc2" })).toBe(false);
  });
});

const accounts: EntityAccounts = { journalCode: "NDF", employeePayableAccount: "421000", vatRecoverableAccount: "445660", advanceAccount: "425000", bankAccount: "512000", corporateCardAccount: "467100", fxGainAccount: "766000", fxLossAccount: "666000" };

describe("accounting", () => {
  const mapping = (id: string) => ({ HOTEL: { glAccount: "625100", analyticalAccount: "TRV", vatCode: "V20", vatDeductiblePct: 100 }, MEALS: { glAccount: "625700", analyticalAccount: null, vatCode: "V10", vatDeductiblePct: 50 } } as Record<string, any>)[id];
  const report = {
    reportId: "r1", reportNumber: "FR01-2026-000001", employeeRef: "E001", currency: "EUR", documentDate: day("2026-03-31"), advanceApplied: "100",
    lines: [
      { lineNo: 1, categoryId: "HOTEL", categoryName: "Hotel", description: "", merchant: "Ibis", functionalAmount: "240.00", functionalTax: "40.00", txnAmount: "240", txnCurrency: "EUR", costCenterCode: "CC100", projectCode: "P1", reimbursable: true },
      { lineNo: 2, categoryId: "MEALS", categoryName: "Meals", description: "", merchant: "Diner NYC", functionalAmount: "91.03", functionalTax: "7.33", txnAmount: "100", txnCurrency: "USD", costCenterCode: "CC100", projectCode: null, reimbursable: true },
      { lineNo: 3, categoryId: "HOTEL", categoryName: "Hotel", description: "", merchant: "Hilton", functionalAmount: "300", functionalTax: "0", txnAmount: "300", txnCurrency: "EUR", costCenterCode: "CC100", projectCode: null, reimbursable: false },
    ],
  };
  it("builds a balanced recognition journal with partial VAT recovery, card clearing and advance settlement", () => {
    const j = buildExpenseJournal(report, accounts, mapping);
    expect(sum(j.map((l) => l.debit)).toFixed(2)).toBe(sum(j.map((l) => l.credit)).toFixed(2));
    const vat = j.filter((l) => l.account === "445660").map((l) => l.debit.toFixed(2));
    expect(vat).toEqual(["40.00", "3.67"]); // 50% of 7.33 rounded half-up
    expect(j.find((l) => l.account === "625700")!.debit.toFixed(2)).toBe("87.36");
    expect(j.find((l) => l.account === "625700")!.txnCurrency).toBe("USD");
    expect(j.find((l) => l.account === "421000" && l.credit.gt(0))!.credit.toFixed(2)).toBe("331.03");
    expect(j.find((l) => l.account === "467100")!.credit.toFixed(2)).toBe("300.00");
    expect(j.find((l) => l.account === "425000")!.credit.toFixed(2)).toBe("100.00");
  });
  it("fails loudly when a category has no GL mapping", () => {
    expect(() => buildExpenseJournal(report, accounts, () => undefined)).toThrow(AccountingError);
  });
  it("builds payment journals and posts into the next open period", () => {
    expect(buildPaymentJournal({ reportNumber: "X", employeeRef: "E", amount: "231.03", currency: "EUR", bankReference: "B1" }, accounts).map((l) => l.account)).toEqual(["421000", "512000"]);
    expect(resolvePostingPeriod("2026-03", [{ period: "2026-03", status: "CLOSED" }, { period: "2026-04", status: "CLOSED" }])).toBe("2026-05");
    expect(resolvePostingPeriod("2026-12", [{ period: "2026-12", status: "CLOSED" }])).toBe("2027-01");
  });
  it("renders every ERP layout with matching column counts", () => {
    const line = { entityCode: "FR01", companyCode: "1000", journalCode: "NDF", period: "2026-03", documentDate: day("2026-03-31"), documentNumber: "FR01-2026-000001", lineNo: 1, account: "625100", analyticalAccount: null, costCenter: "CC100", projectCode: null, vatCode: "V20", description: "Hotel", debit: "200.00", credit: "0.00", currency: "EUR", txnAmount: null, txnCurrency: null, employeeRef: "E001" };
    for (const layout of Object.values(LAYOUTS)) expect(layout.row(line)).toHaveLength(layout.headers.length);
    expect(LAYOUTS.SAP.row(line)[8]).toBe("S");
  });
});

describe("utilities", () => {
  it("neutralises CSV formula injection", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(toCsv(["a"], [["x,y"]])).toContain("\"x,y\"");
  });
  it("parses receipt text in several formats", () => {
    const r = parseReceiptText("LE PETIT BISTRO\n12 rue de Rivoli\nDate: 14/03/2026\nTVA 10% 4,55\nTOTAL TTC 50,05 €");
    expect(r).toMatchObject({ merchant: "LE PETIT BISTRO", date: "2026-03-14", total: "50.05", tax: "4.55", currency: "EUR" });
    const us = parseReceiptText("Uber Technologies\n2026-03-02\nTax $1.20\nTotal $24.80 USD");
    expect(us).toMatchObject({ date: "2026-03-02", total: "24.80", currency: "USD" });
  });
  it("creates stable fingerprints regardless of merchant noise", () => {
    expect(normalizeMerchant("STARBUCKS #1234 Paris")).toBe(normalizeMerchant("Starbucks Paris"));
    const base = { employeeId: "u1", expenseDate: day("2026-03-01"), grossAmount: "12.5", currency: "EUR", merchant: "Starbucks SAS" };
    expect(expenseFingerprint(base)).toBe(expenseFingerprint({ ...base, grossAmount: "12.50", merchant: "STARBUCKS" }));
    expect(expenseFingerprint(base)).not.toBe(expenseFingerprint({ ...base, grossAmount: "12.51" }));
  });
  it("computes mileage with the rate valid at the trip date", () => {
    const rates = [
      { vehicleType: "CAR", ratePerKm: "0.55", currency: "EUR", validFrom: day("2025-01-01"), validTo: day("2025-12-31") },
      { vehicleType: "CAR", ratePerKm: "0.60", currency: "EUR", validFrom: day("2026-01-01"), validTo: null },
    ];
    const r = findMileageRate(rates, "CAR", day("2026-02-01"))!;
    expect(mileageAmount("123.4", r).toFixed(2)).toBe("74.04");
    expect(() => mileageAmount("0", r)).toThrow();
  });
});
