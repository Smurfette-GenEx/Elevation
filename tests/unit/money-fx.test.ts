import { describe, it, expect } from "vitest";
import { roundMoney, splitGross, minorUnits, d } from "@/server/domain/money";
import { FxTable, FxRateNotFoundError, fxDifference, parseEcbXml, rateDeviationPct } from "@/server/domain/fx";

const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe("money", () => {
  it("rounds per ISO 4217 minor units", () => {
    expect(minorUnits("JPY")).toBe(0);
    expect(minorUnits("KWD")).toBe(3);
    expect(roundMoney("10.005", "EUR").toFixed(2)).toBe("10.01");
    expect(roundMoney("1234.5", "JPY").toString()).toBe("1235");
  });
  it("splits gross into net + tax with exact reconciliation", () => {
    const s = splitGross("120.00", 20, "EUR");
    expect(s.tax.toFixed(2)).toBe("20.00");
    expect(s.net.plus(s.tax).equals(s.gross)).toBe(true);
    const odd = splitGross("9.99", 5.5, "EUR");
    expect(odd.net.plus(odd.tax).toFixed(2)).toBe("9.99");
  });
});

describe("FxTable", () => {
  const table = new FxTable([
    { baseCurrency: "EUR", quoteCurrency: "USD", rate: "1.10", effectiveDate: day("2026-03-01"), source: "ECB" },
    { baseCurrency: "EUR", quoteCurrency: "USD", rate: "1.20", effectiveDate: day("2026-03-10"), source: "ECB" },
    { baseCurrency: "EUR", quoteCurrency: "USD", rate: "1.15", effectiveDate: day("2026-03-10"), source: "MANUAL" },
    { baseCurrency: "EUR", quoteCurrency: "GBP", rate: "0.85", effectiveDate: day("2026-03-01"), source: "ECB" },
  ]);

  it("uses the latest rate on or before the date (historical rates preserved)", () => {
    expect(table.resolve("EUR", "USD", day("2026-03-05")).rate.toString()).toBe("1.1");
  });
  it("prefers MANUAL over ECB for the same effective date", () => {
    const r = table.resolve("EUR", "USD", day("2026-03-11"));
    expect(r.rate.toString()).toBe("1.15");
    expect(r.source).toBe("MANUAL");
  });
  it("inverts and crosses via EUR pivot", () => {
    expect(table.resolve("USD", "EUR", day("2026-03-05")).rate.toFixed(6)).toBe("0.909091");
    const cross = table.convert("100", "USD", "GBP", day("2026-03-05"));
    expect(cross.path).toBe("USD>EUR>GBP");
    expect(cross.amount.toFixed(2)).toBe("77.27");
  });
  it("throws when no rate exists or the rate is stale", () => {
    expect(() => table.resolve("EUR", "JPY", day("2026-03-05"))).toThrow(FxRateNotFoundError);
    expect(() => table.resolve("EUR", "GBP", day("2026-05-30"))).toThrow(FxRateNotFoundError);
  });
  it("computes FX differences and override deviation", () => {
    expect(fxDifference("1000", "0.90", "0.92", "EUR").toFixed(2)).toBe("20.00");
    expect(rateDeviationPct("1.10", "1.21").toFixed(1)).toBe("10.0");
  });
  it("parses the ECB XML feed", () => {
    const xml = `<gesmes:Envelope><Cube><Cube time='2026-11-18'><Cube currency='USD' rate='1.0812'/><Cube currency='GBP' rate='0.8420'/></Cube></Cube></gesmes:Envelope>`;
    const p = parseEcbXml(xml);
    expect(p.rates).toHaveLength(2);
    expect(p.date.toISOString().slice(0, 10)).toBe("2026-11-18");
    expect(d(p.rates[0].rate).toNumber()).toBe(1.0812);
  });
});
