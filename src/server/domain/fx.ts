import { Decimal, d, roundMoney, type DecimalLike } from "./money";

export type FxSourceName = "ECB" | "MANUAL" | "CORPORATE" | "IDENTITY";

export interface RateRecord {
  baseCurrency: string;
  quoteCurrency: string;
  rate: DecimalLike;
  effectiveDate: Date;
  source: FxSourceName;
}

export interface ResolvedRate {
  rate: Decimal; // 1 from = rate to
  source: FxSourceName;
  effectiveDate: Date;
  path: string; // e.g. "USD>EUR" or "USD>EUR>GBP" (cross via pivot)
}

export class FxRateNotFoundError extends Error {
  constructor(public from: string, public to: string, public date: Date) {
    super(`No exchange rate available for ${from}->${to} on or before ${date.toISOString().slice(0, 10)}`);
    this.name = "FxRateNotFoundError";
  }
}

/** Source precedence when several rates exist for the same date. */
const SOURCE_PRIORITY: Record<FxSourceName, number> = { MANUAL: 3, CORPORATE: 2, ECB: 1, IDENTITY: 0 };

/** Rates older than this are considered stale and not used. */
const MAX_STALENESS_DAYS = 10;

/**
 * In-memory FX resolver over a set of rate records.
 * Lookup order: identity -> direct -> inverse -> cross via pivot (EUR by default).
 * Always uses the most recent rate effective ON OR BEFORE the transaction date,
 * which preserves historical rates: adding new rates never changes past conversions.
 */
export class FxTable {
  private byPair = new Map<string, RateRecord[]>();

  constructor(records: RateRecord[], private pivot = "EUR") {
    for (const r of records) {
      const key = `${r.baseCurrency}>${r.quoteCurrency}`;
      const list = this.byPair.get(key) ?? [];
      list.push(r);
      this.byPair.set(key, list);
    }
    for (const list of this.byPair.values()) {
      list.sort(
        (a, b) =>
          b.effectiveDate.getTime() - a.effectiveDate.getTime() ||
          SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source],
      );
    }
  }

  private latest(from: string, to: string, date: Date): RateRecord | undefined {
    const list = this.byPair.get(`${from}>${to}`);
    if (!list) return undefined;
    const minDate = date.getTime() - MAX_STALENESS_DAYS * 86400_000;
    return list.find((r) => r.effectiveDate.getTime() <= date.getTime() && r.effectiveDate.getTime() >= minDate);
  }

  private pair(from: string, to: string, date: Date): ResolvedRate | undefined {
    const direct = this.latest(from, to, date);
    if (direct) return { rate: d(direct.rate), source: direct.source, effectiveDate: direct.effectiveDate, path: `${from}>${to}` };
    const inverse = this.latest(to, from, date);
    if (inverse) {
      return {
        rate: new Decimal(1).dividedBy(d(inverse.rate)),
        source: inverse.source,
        effectiveDate: inverse.effectiveDate,
        path: `${from}>${to}(inv)`,
      };
    }
    return undefined;
  }

  resolve(from: string, to: string, date: Date): ResolvedRate {
    if (from === to) return { rate: new Decimal(1), source: "IDENTITY", effectiveDate: date, path: from };
    const p = this.pair(from, to, date);
    if (p) return p;
    if (from !== this.pivot && to !== this.pivot) {
      const a = this.pair(from, this.pivot, date);
      const b = this.pair(this.pivot, to, date);
      if (a && b) {
        return {
          rate: a.rate.times(b.rate),
          source: SOURCE_PRIORITY[a.source] >= SOURCE_PRIORITY[b.source] ? a.source : b.source,
          effectiveDate: a.effectiveDate < b.effectiveDate ? a.effectiveDate : b.effectiveDate,
          path: `${from}>${this.pivot}>${to}`,
        };
      }
    }
    throw new FxRateNotFoundError(from, to, date);
  }

  convert(amount: DecimalLike, from: string, to: string, date: Date) {
    const r = this.resolve(from, to, date);
    return { ...r, amount: roundMoney(d(amount).times(r.rate), to) };
  }
}

/**
 * FX difference between a reference conversion and an applied conversion of the same
 * transaction amount — e.g. the impact of a manual override, or a realised difference
 * between booking rate and settlement rate. Positive = more functional currency.
 */
export function fxDifference(txnAmount: DecimalLike, referenceRate: DecimalLike, appliedRate: DecimalLike, currency: string): Decimal {
  return roundMoney(d(txnAmount).times(d(appliedRate)), currency).minus(roundMoney(d(txnAmount).times(d(referenceRate)), currency));
}

/** Relative deviation (in %) of an override from the reference rate. */
export function rateDeviationPct(referenceRate: DecimalLike, overrideRate: DecimalLike): Decimal {
  const ref = d(referenceRate);
  if (ref.isZero()) return new Decimal(0);
  return d(overrideRate).minus(ref).dividedBy(ref).times(100).abs();
}

/** Parse the ECB daily reference rate XML feed (EUR base). */
export function parseEcbXml(xml: string): { date: Date; rates: { currency: string; rate: string }[] } {
  const timeMatch = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/);
  if (!timeMatch) throw new Error("ECB feed: missing date");
  const rates: { currency: string; rate: string }[] = [];
  const re = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) rates.push({ currency: m[1], rate: m[2] });
  if (rates.length === 0) throw new Error("ECB feed: no rates found");
  return { date: new Date(`${timeMatch[1]}T00:00:00Z`), rates };
}
