const DIGITS: Record<string, number> = { JPY: 0, KRW: 0, BHD: 3, KWD: 3, OMR: 3, TND: 3 };

export function money(value: number | string | { toString(): string } | null | undefined, currency: string, locale = "en-GB") {
  const n = Number(value?.toString() ?? 0);
  const digits = DIGITS[currency] ?? 2;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  } catch {
    return `${n.toFixed(digits)} ${currency}`;
  }
}

export function compactMoney(n: number, currency: string, locale = "en-GB") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function date(value: Date | string | null | undefined, locale = "en-GB") {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

export function dateTime(value: Date | string | null | undefined, locale = "en-GB") {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function isoDate(d: Date | string) {
  return (typeof d === "string" ? d : d.toISOString()).slice(0, 10);
}

export function pct(n: number) {
  return `${n.toFixed(n >= 100 ? 0 : 1)}%`;
}
