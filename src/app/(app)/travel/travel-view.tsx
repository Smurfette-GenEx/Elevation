"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { GenericBadge } from "@/components/app/status";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { date, money } from "@/lib/format";

type Trip = { id: string; purpose: string; destinationCity: string; destinationCountry: string; startDate: string; endDate: string; status: string; currency: string; estimatedCost: string | null; employee: { name: string }; reports: { id: string; number: string; status: string }[] };
type Adv = { id: string; number: string; employeeId: string; purpose: string; amount: string; settledAmount: string; currency: string; status: string; employee: { name: string }; settlements: { amount: string; report: { number: string } }[] };

export function TravelView({ actorId, canPay, trips, advances }: { actorId: string; canPay: boolean; trips: Trip[]; advances: Adv[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<unknown>) => fn().then(() => router.refresh()).catch((e) => setError(errorMessage(e)));
  async function newTrip(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    act(() => apiFetch("/api/v1/trips", { method: "POST", json: { ...f, estimatedCost: f.estimatedCost || null } }));
    e.currentTarget.reset();
  }
  async function newAdvance(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    act(() => apiFetch("/api/v1/advances", { method: "POST", json: { amount: f.amount, purpose: f.purpose } }));
    e.currentTarget.reset();
  }
  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Plan a trip</CardTitle></CardHeader><CardContent>
          <form onSubmit={newTrip} className="grid gap-3 sm:grid-cols-2">
            <Field label="Purpose" className="sm:col-span-2"><Input name="purpose" required minLength={5} /></Field>
            <Field label="City"><Input name="destinationCity" required /></Field>
            <Field label="Country (ISO code)"><Input name="destinationCountry" required pattern="[A-Z]{2}" maxLength={2} placeholder="GB" /></Field>
            <Field label="Start"><Input name="startDate" type="date" required /></Field>
            <Field label="End"><Input name="endDate" type="date" required /></Field>
            <Field label="Estimated cost"><Input name="estimatedCost" inputMode="decimal" /></Field>
            <div className="flex items-end justify-end"><Button type="submit">Create trip</Button></div>
          </form>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Request an advance</CardTitle></CardHeader><CardContent>
          <form onSubmit={newAdvance} className="grid gap-3">
            <Field label="Amount (entity currency)"><Input name="amount" inputMode="decimal" required /></Field>
            <Field label="Purpose"><Input name="purpose" required minLength={5} /></Field>
            <div className="flex justify-end"><Button type="submit">Request advance</Button></div>
          </form>
        </CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Advances</CardTitle></CardHeader>
        <Table><THead><TR><TH>Number</TH><TH>Employee</TH><TH>Purpose</TH><TH className="text-right">Amount</TH><TH className="text-right">Settled</TH><TH>Status</TH><TH /></TR></THead>
          <TBody>{advances.map((a) => (
            <TR key={a.id}>
              <TD className="font-mono text-xs">{a.number}</TD><TD>{a.employee.name}</TD><TD className="max-w-60 truncate">{a.purpose}{a.settlements.length > 0 && <p className="text-[11px] text-muted-foreground">offset in {a.settlements.map((s) => s.report.number).join(", ")}</p>}</TD>
              <TD className="text-right tabular">{money(a.amount, a.currency)}</TD><TD className="text-right tabular">{money(a.settledAmount, a.currency)}</TD><TD><GenericBadge value={a.status} /></TD>
              <TD className="whitespace-nowrap text-right">
                {a.status === "REQUESTED" && a.employeeId !== actorId && <><Button size="sm" variant="ghost" onClick={() => act(() => apiFetch(`/api/v1/advances/${a.id}/decision`, { method: "POST", json: { approve: false } }))}>Reject</Button><Button size="sm" variant="success" onClick={() => act(() => apiFetch(`/api/v1/advances/${a.id}/decision`, { method: "POST", json: { approve: true } }))}>Approve</Button></>}
                {a.status === "APPROVED" && canPay && a.employeeId !== actorId && <Button size="sm" onClick={() => { const ref = prompt("Bank payment reference"); if (ref) act(() => apiFetch(`/api/v1/advances/${a.id}/paid`, { method: "POST", json: { paymentRef: ref } })); }}>Mark paid</Button>}
              </TD>
            </TR>))}
            {advances.length === 0 && <TR><TD colSpan={7} className="text-center text-muted-foreground">No advances.</TD></TR>}
          </TBody></Table>
      </Card>
      <Card><CardHeader><CardTitle>Trips</CardTitle></CardHeader>
        <Table><THead><TR><TH>Destination</TH><TH>Employee</TH><TH>Dates</TH><TH>Purpose</TH><TH>Expense reports</TH></TR></THead>
          <TBody>{trips.map((t) => (
            <TR key={t.id}><TD className="font-medium">{t.destinationCity}, {t.destinationCountry}</TD><TD>{t.employee.name}</TD><TD className="whitespace-nowrap">{date(t.startDate)} → {date(t.endDate)}</TD><TD className="max-w-64 truncate">{t.purpose}</TD>
              <TD>{t.reports.length ? t.reports.map((r) => <Link key={r.id} href={`/expenses/${r.id}`} className="mr-2 text-primary hover:underline">{r.number}</Link>) : <span className="text-muted-foreground">—</span>}</TD></TR>))}
            {trips.length === 0 && <TR><TD colSpan={5} className="text-center text-muted-foreground">No trips planned.</TD></TR>}
          </TBody></Table>
      </Card>
    </div>
  );
}
