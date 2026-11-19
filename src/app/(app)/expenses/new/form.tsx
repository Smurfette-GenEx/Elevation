"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch, errorMessage } from "@/lib/client-api";

export function NewReportForm({ trips }: { trips: { id: string; label: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await apiFetch<{ id: string }>("/api/v1/reports", { method: "POST", json: { title: fd.get("title"), purpose: fd.get("purpose") || null, tripId: fd.get("tripId") || null } });
      router.push(`/expenses/${r.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <Card><CardContent className="pt-5">
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Title"><Input name="title" required minLength={3} maxLength={120} placeholder="e.g. Client visit Milan — March" /></Field>
        <Field label="Business purpose"><Textarea name="purpose" maxLength={500} placeholder="Why were these expenses incurred?" /></Field>
        {trips.length > 0 && (
          <Field label="Linked trip (optional)"><Select name="tripId" defaultValue=""><option value="">No trip</option>{trips.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</Select></Field>
        )}
        <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create draft"}</Button></div>
      </form>
    </CardContent></Card>
  );
}
