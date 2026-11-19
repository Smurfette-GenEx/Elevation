/**
 * Provider-agnostic extraction of key receipt fields from raw OCR text.
 * Used by text-only OCR providers; structured providers (e.g. Azure Document
 * Intelligence prebuilt-receipt) map their own fields to the same shape.
 */
export interface ExtractedReceipt {
  merchant: string | null;
  date: string | null; // YYYY-MM-DD
  total: string | null;
  tax: string | null;
  currency: string | null;
  confidence: number; // 0..1, share of fields found
}

const CURRENCY_SYMBOLS: Record<string, string> = { "€": "EUR", "£": "GBP", "$": "USD", "¥": "JPY", "CHF": "CHF", "DH": "MAD", "MAD": "MAD", "R$": "BRL" };
const ISO = /\b(EUR|USD|GBP|CHF|JPY|MAD|CAD|AUD|SEK|NOK|DKK|PLN|CZK|AED|SGD|INR|CNY|BRL|ZAR)\b/;

function parseAmount(raw: string): string | null {
  let s = raw.replace(/\s/g, "");
  // 1.234,56 -> 1234.56 ; 1,234.56 -> 1234.56 ; 12,50 -> 12.50
  if (/,\d{2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : null;
}

function parseDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const eu = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2}|\d{2})\b/);
  if (eu) {
    const year = eu[3].length === 2 ? `20${eu[3]}` : eu[3];
    const [a, b] = [Number(eu[1]), Number(eu[2])];
    // Prefer day-first (international default); if first part > 12 it must be a day anyway.
    const [day, month] = a > 12 || b <= 12 ? [a, b] : [b, a];
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

const AMOUNT = String.raw`(\d{1,3}(?:[ .,]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2}))`;

export function parseReceiptText(text: string): ExtractedReceipt {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const merchant = lines.find((l) => /[A-Za-z]{3,}/.test(l) && !/receipt|invoice|facture|ticket|date|tel|www\./i.test(l)) ?? null;

  const totalRe = new RegExp(String.raw`(?:total\s*(?:ttc|due|amount)?|amount\s*due|montant|grand\s*total|to\s*pay)[^\d\n]{0,12}` + AMOUNT, "i");
  const taxRe = new RegExp(String.raw`(?:vat|tva|tax|iva|mwst|gst)[^\d\n]{0,20}?(?:\d{1,2}(?:[.,]\d+)?\s*%[^\d\n]{0,6})?` + AMOUNT, "i");
  const totalMatch = text.match(totalRe);
  const taxMatch = text.match(taxRe);

  let total = totalMatch ? parseAmount(totalMatch[1]) : null;
  if (!total) {
    const all = [...text.matchAll(new RegExp(AMOUNT, "g"))].map((m) => parseAmount(m[1])).filter((x): x is string => !!x);
    if (all.length) total = all.sort((a, b) => Number(b) - Number(a))[0];
  }

  let currency: string | null = text.match(ISO)?.[1] ?? null;
  if (!currency) {
    for (const [sym, code] of Object.entries(CURRENCY_SYMBOLS)) {
      if (text.includes(sym)) {
        currency = code;
        break;
      }
    }
  }

  const result = {
    merchant: merchant ? merchant.slice(0, 80) : null,
    date: parseDate(text),
    total,
    tax: taxMatch ? parseAmount(taxMatch[1]) : null,
    currency,
  };
  const found = Object.values(result).filter(Boolean).length;
  return { ...result, confidence: Math.round((found / 5) * 100) / 100 };
}
