/** Date helpers that operate on calendar dates in UTC (expense dates are @db.Date). */

export function toDateOnly(input: Date | string): Date {
  const s = typeof input === "string" ? input.slice(0, 10) : input.toISOString().slice(0, 10);
  return new Date(`${s}T00:00:00Z`);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function periodOf(date: Date): string {
  return date.toISOString().slice(0, 7); // YYYY-MM
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((toDateOnly(b).getTime() - toDateOnly(a).getTime()) / 86400_000);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3600_000);
}

export function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
