import { createHash } from "node:crypto";
import { d, type DecimalLike } from "./money";
import { isoDate } from "./dates";

/** Normalise merchant names so "STARBUCKS #1234 PARIS" and "Starbucks Paris" collide. */
export function normalizeMerchant(merchant: string): string {
  return merchant
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/#?\d{2,}/g, "")
    .replace(/\b(sa|sas|sarl|ltd|llc|inc|gmbh|plc|bv|srl|spa)\b/g, "")
    .replace(/[^a-z]/g, "")
    .slice(0, 24);
}

/**
 * Fingerprint used for duplicate-expense detection: same employee, same date,
 * same amount & currency, similar merchant.
 */
export function expenseFingerprint(input: {
  employeeId: string;
  expenseDate: Date;
  grossAmount: DecimalLike;
  currency: string;
  merchant: string;
}): string {
  const key = [
    input.employeeId,
    isoDate(input.expenseDate),
    d(input.grossAmount).toFixed(2),
    input.currency.toUpperCase(),
    normalizeMerchant(input.merchant),
  ].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 40);
}

export function sha256(buffer: Buffer | Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}
