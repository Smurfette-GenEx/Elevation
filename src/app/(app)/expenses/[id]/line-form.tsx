"use client";
import { useState } from "react";
import { Upload, Loader2, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { cn } from "@/lib/utils";

export interface Reference {
  categories: { id: string; name: string; isMileage: boolean; isAccommodation: boolean; requiresAttendees: boolean }[];
  costCenters: { id: string; code: string; name: string }[];
  projects: { id: string; code: string; name: string }[];
  countries: { code: string; name: string }[];
  currencies: string[];
  functionalCurrency: string;
  defaultCostCenterId: string | null;
  mileageRates: { vehicleType: string; ratePerKm: string; currency: string }[];
}
export interface LineData {
  id?: string;
  expenseDate: string; categoryId: string; merchant: string; description: string; countryCode: string; currency: string;
  grossAmount: string; taxAmount: string; costCenterId: string; projectId: string | null; paymentMethod: string; attendees: string | null;
  nights: number | null; receiptId: string | null; distanceKm: string | null; vehicleType: string | null; fromLocation: string | null; toLocation: string | null;
}
type Ocr = { merchant: string | null; date: string | null; total: string | null; tax: string | null; currency: string | null; confidence: number };

export function LineForm({ reportId, reference, line, onSaved }: { reportId: string; reference: Reference; line: LineData | null; onSaved: () => void }) {
  const [v, setV] = useState({
    expenseDate: line?.expenseDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    categoryId: line?.categoryId ?? reference.categories[0]?.id ?? "",
    merchant: line?.merchant ?? "",
    description: line?.description ?? "",
    countryCode: line?.countryCode ?? reference.countries[0]?.code ?? "",
    currency: line?.currency ?? reference.functionalCurrency,
    grossAmount: line ? String(Number(line.grossAmount)) : "",
    taxAmount: line ? String(Number(line.taxAmount)) : "",
    costCenterId: line?.costCenterId ?? reference.defaultCostCenterId ?? reference.costCenters[0]?.id ?? "",
    projectId: line?.projectId ?? "",
    paymentMethod: line?.paymentMethod ?? "PERSONAL_CARD",
    attendees: line?.attendees ?? "",
    nights: line?.nights ? String(line.nights) : "",
    receiptId: line?.receiptId ?? null as string | null,
    distanceKm: line?.distanceKm ? String(Number(line.distanceKm)) : "",
    vehicleType: line?.vehicleType ?? reference.mileageRates[0]?.vehicleType ?? "CAR",
    fromLocation: line?.fromLocation ?? "",
    toLocation: line?.toLocation ?? "",
  });
  const [receiptName, setReceiptName] = useState<string | null>(line?.receiptId ? "Attached receipt" : null);
  const [ocr, setOcr] = useState<Ocr | null>(null);
  const [dup, setDup] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cat = reference.categories.find((c) => c.id === v.categoryId);
  const set = (k: keyof typeof v, val: string | null) => setV((s) => ({ ...s, [k]: val }));
  const rate = reference.mileageRates.find((r) => r.vehicleType === v.vehicleType);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    setDup(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch<{ id: string; fileName: string; ocr: Ocr | null; duplicate: { usedIn: string[] } | null }>("/api/v1/receipts", { method: "POST", body: fd });
      set("receiptId", res.id);
      setReceiptName(res.fileName);
      setOcr(res.ocr && res.ocr.confidence > 0 ? res.ocr : null);
      if (res.duplicate) setDup(`This exact file was already uploaded${res.duplicate.usedIn.length ? ` (used in ${res.duplicate.usedIn.join(", ")})` : ""}. Duplicate receipts are blocked at submission.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  function applyOcr() {
    if (!ocr) return;
    setV((s) => ({
      ...s,
      merchant: ocr.merchant ?? s.merchant,
      expenseDate: ocr.date ?? s.expenseDate,
      grossAmount: ocr.total ?? s.grossAmount,
      taxAmount: ocr.tax ?? s.taxAmount,
      currency: ocr.currency && reference.currencies.includes(ocr.currency) ? ocr.currency : s.currency,
    }));
    if (v.receiptId) apiFetch(`/api/v1/receipts/${v.receiptId}/confirm`, { method: "POST" }).catch(() => undefined);
    setOcr(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      expenseDate: v.expenseDate, categoryId: v.categoryId, merchant: cat?.isMileage ? v.merchant || "Personal vehicle" : v.merchant, description: v.description,
      countryCode: v.countryCode, currency: v.currency, costCenterId: v.costCenterId, projectId: v.projectId || null, paymentMethod: v.paymentMethod,
      attendees: v.attendees || null, nights: cat?.isAccommodation && v.nights ? Number(v.nights) : null, receiptId: v.receiptId,
      ...(cat?.isMileage
        ? { mileage: { distanceKm: v.distanceKm, vehicleType: v.vehicleType, fromLocation: v.fromLocation, toLocation: v.toLocation } }
        : { grossAmount: v.grossAmount, taxAmount: v.taxAmount || "0" }),
    };
    try {
      await apiFetch(line?.id ? `/api/v1/reports/${reportId}/expenses/${line.id}` : `/api/v1/reports/${reportId}/expenses`, { method: line?.id ? "PUT" : "POST", json: body });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {!cat?.isMileage && (
        <label
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
          className={cn("flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-5 text-center text-sm transition-colors", drag ? "border-primary bg-accent" : "hover:bg-muted/50")}>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          {uploading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : <Upload className="size-5 text-muted-foreground" />}
          <span className="font-medium">{receiptName ? `Receipt: ${receiptName}` : "Drop the receipt here or click to browse"}</span>
          <span className="text-xs text-muted-foreground">PDF, JPG or PNG · max 10 MB · data is extracted automatically</span>
        </label>
      )}
      {dup && <Alert tone="warning">{dup}</Alert>}
      {ocr && (
        <Alert tone="info" title="We read this from your receipt — please confirm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs"><ScanText className="size-4" />{[ocr.merchant, ocr.date, ocr.total && `${ocr.total} ${ocr.currency ?? ""}`, ocr.tax && `tax ${ocr.tax}`].filter(Boolean).join(" · ")} ({Math.round(ocr.confidence * 100)}% fields found)</span>
            <span className="flex gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => setOcr(null)}>Ignore</Button><Button type="button" size="sm" onClick={applyOcr}>Use these values</Button></span>
          </div>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Category"><Select value={v.categoryId} onChange={(e) => set("categoryId", e.target.value)}>{reference.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Date"><Input type="date" value={v.expenseDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set("expenseDate", e.target.value)} required /></Field>
        <Field label="Country incurred"><Select value={v.countryCode} onChange={(e) => set("countryCode", e.target.value)}>{reference.countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</Select></Field>
      </div>
      {cat?.isMileage ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Vehicle"><Select value={v.vehicleType} onChange={(e) => set("vehicleType", e.target.value)}>{reference.mileageRates.map((r) => <option key={r.vehicleType} value={r.vehicleType}>{r.vehicleType}</option>)}</Select></Field>
          <Field label="Distance (km)" hint={rate ? `${rate.ratePerKm} ${rate.currency}/km = ${(Number(v.distanceKm || 0) * Number(rate.ratePerKm)).toFixed(2)} ${rate.currency}` : "No rate configured"}><Input inputMode="decimal" value={v.distanceKm} onChange={(e) => set("distanceKm", e.target.value)} required /></Field>
          <Field label="From"><Input value={v.fromLocation} onChange={(e) => set("fromLocation", e.target.value)} required /></Field>
          <Field label="To"><Input value={v.toLocation} onChange={(e) => set("toLocation", e.target.value)} required /></Field>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Merchant / supplier" className="sm:col-span-2"><Input value={v.merchant} onChange={(e) => set("merchant", e.target.value)} required maxLength={120} /></Field>
          <Field label="Currency"><Select value={v.currency} onChange={(e) => set("currency", e.target.value)}>{reference.currencies.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Payment method"><Select value={v.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>
            <option value="PERSONAL_CARD">Personal card</option><option value="CASH">Cash</option><option value="CORPORATE_CARD">Corporate card</option><option value="COMPANY_PAID">Paid by company</option><option value="BANK_TRANSFER">Bank transfer</option>
          </Select></Field>
          <Field label="Gross amount (incl. tax)"><Input inputMode="decimal" value={v.grossAmount} onChange={(e) => set("grossAmount", e.target.value)} required /></Field>
          <Field label="VAT / tax amount"><Input inputMode="decimal" value={v.taxAmount} onChange={(e) => set("taxAmount", e.target.value)} placeholder="0.00" /></Field>
          <Field label="Net amount"><span className="block py-2 text-sm tabular text-muted-foreground">{(Number(v.grossAmount || 0) - Number(v.taxAmount || 0)).toFixed(2)} {v.currency}</span></Field>
          {cat?.isAccommodation && <Field label="Nights"><Input type="number" min={1} max={60} value={v.nights} onChange={(e) => set("nights", e.target.value)} required /></Field>}
        </div>
      )}
      <Field label="Business purpose / description"><Textarea value={v.description} onChange={(e) => set("description", e.target.value)} required maxLength={500} className="min-h-14" /></Field>
      {cat?.requiresAttendees && <Field label="Attendees (names and companies)"><Input value={v.attendees} onChange={(e) => set("attendees", e.target.value)} required /></Field>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cost center"><Select value={v.costCenterId} onChange={(e) => set("costCenterId", e.target.value)}>{reference.costCenters.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}</Select></Field>
        <Field label="Project (optional)"><Select value={v.projectId} onChange={(e) => set("projectId", e.target.value)}><option value="">None</option>{reference.projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</Select></Field>
      </div>
      {v.currency !== reference.functionalCurrency && !cat?.isMileage && <p className="text-xs text-muted-foreground">Converted to {reference.functionalCurrency} at the reference rate of the expense date. The original {v.currency} amount is kept.</p>}
      <div className="flex justify-end gap-2"><Button type="submit" disabled={busy || uploading}>{busy ? "Saving…" : "Save expense"}</Button></div>
    </form>
  );
}
