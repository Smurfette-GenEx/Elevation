import Decimal from "decimal.js";

// Banker's rounding is NOT used for financial postings here: ROUND_HALF_UP matches
// the behaviour of most ERPs (SAP, D365, Sage) for currency amounts.
Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export type DecimalLike = Decimal | string | number | { toString(): string };

/** ISO 4217 minor units for currencies that do not use 2 decimals. */
const MINOR_UNITS: Record<string, number> = {
  JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0, XOF: 0, XAF: 0, UGX: 0,
  BHD: 3, KWD: 3, OMR: 3, JOD: 3, TND: 3, LYD: 3, IQD: 3,
};

export function minorUnits(currency: string): number {
  return MINOR_UNITS[currency.toUpperCase()] ?? 2;
}

export function d(value: DecimalLike | null | undefined): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  return value instanceof Decimal ? value : new Decimal(value.toString());
}

/** Round an amount to the currency's minor units. */
export function roundMoney(value: DecimalLike, currency: string): Decimal {
  return d(value).toDecimalPlaces(minorUnits(currency), Decimal.ROUND_HALF_UP);
}

export function sum(values: DecimalLike[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(d(v)), new Decimal(0));
}

export function isValidCurrency(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

export function formatMoney(value: DecimalLike, currency: string, locale = "en-GB"): string {
  const digits = minorUnits(currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(d(value).toNumber());
}

/**
 * Split a gross amount into net + tax given a tax rate in percent (e.g. 20 for 20%).
 * Tax is rounded; net is derived so that net + tax === gross exactly.
 */
export function splitGross(gross: DecimalLike, taxRatePct: DecimalLike, currency: string) {
  const g = roundMoney(gross, currency);
  const rate = d(taxRatePct);
  const tax = rate.isZero() ? new Decimal(0) : roundMoney(g.minus(g.dividedBy(rate.dividedBy(100).plus(1))), currency);
  return { gross: g, tax, net: g.minus(tax) };
}
