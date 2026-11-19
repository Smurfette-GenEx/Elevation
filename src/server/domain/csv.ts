/**
 * CSV writer with protection against spreadsheet formula injection (CWE-1236):
 * cells starting with = + - @ TAB CR are prefixed with a single quote, unless they are plain numbers.
 */
const NUMERIC = /^-?\d+(\.\d+)?$/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !NUMERIC.test(s)) s = `'${s}`;
  if (/[",\n\r;]/.test(s)) s = `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][], separator = ","): string {
  const lines = [headers.map(csvCell).join(separator), ...rows.map((r) => r.map(csvCell).join(separator))];
  // BOM so Excel opens UTF-8 (accents, currency symbols) correctly
  return "﻿" + lines.join("\r\n") + "\r\n";
}
