"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { GenericBadge } from "@/components/app/status";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { date, money } from "@/lib/format";

type Rep = { id: string; number: string; employeeId: string; legalEntityId: string; currency: string; netPayable: string; approvedAt: string; employee: { name: string; employeeNumber: string | null }; legalEntity: { code: string } };
type Batch = { id: string; reference: string; status: string; currency: string; totalAmount: string; paymentDate: string | null; createdAt: string; legalEntity: { code: string }; payments: { id: string; amount: string; status: string; bankReference: string | null; report: { number: string; employee: { name: string } } }[] };

export function ReimbursementsView({ actorId, payable, batches }: { actorId: string; payable: Rep[]; batches: Batch[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const act = (fn: () => Promise<unknown>) => { setError(null); return fn().then(() => { setSelected(new Set()); router.refresh(); }).catch((e) => setError(errorMessage(e))); };
  const entities = [...new Set(payable.filter((r) => selected.has(r.id)).map((r) => r.legalEntityId))];
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const total = payable.filter((r) => selected.has(r.id)).reduce((a, r) => a + Number(r.netPayable), 0);

  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}
      <Card>
        <CardHeader><CardTitle>Ready for payment</CardTitle><CardDescription>Select reports of a single entity to build a batch.</CardDescription></CardHeader>
        {payable.length === 0 ? <CardContent><EmptyState title="Nothing to pay" description="Approved reports appear here once fully approved." /></CardContent> : (
          <>
            <Table>
              <THead><TR><TH className="w-8" /><TH>Report</TH><TH>Employee</TH><TH>Entity</TH><TH>Approved</TH><TH className="text-right">Net payable</TH></TR></THead>
              <TBody>{payable.map((r) => (
                <TR key={r.id}>
                  <TD><input type="checkbox" aria-label={`Select ${r.number}`} checked={selected.has(r.id)} disabled={r.employeeId === actorId} onChange={() => toggle(r.id)} /></TD>
                  <TD><Link href={`/expenses/${r.id}`} className="text-primary hover:underline">{r.number}</Link></TD>
                  <TD>{r.employee.name} <span className="text-xs text-muted-foreground">{r.employee.employeeNumber}</span></TD>
                  <TD>{r.legalEntity.code}</TD><TD>{date(r.approvedAt)}</TD>
                  <TD className="text-right tabular font-medium">{money(r.netPayable, r.currency)}</TD>
                </TR>))}
              </TBody>
            </Table>
            <div className="flex flex-wrap items-center justify-end gap-3 border-t p-4">
              {entities.length > 1 && <span className="text-xs text-destructive">Select reports from one entity only</span>}
              <span className="text-sm">{selected.size} selected · <span className="font-semibold tabular">{total.toFixed(2)}</span></span>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-40" aria-label="Payment date" />
              <Button disabled={selected.size === 0 || entities.length !== 1} onClick={() => act(() => apiFetch("/api/v1/payments/batches", { method: "POST", json: { legalEntityId: entities[0], reportIds: [...selected], paymentDate: payDate } }))}>Create payment batch</Button>
            </div>
          </>
        )}
      </Card>

      <Card>
        <CardHeader><CardTitle>Payment batches</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {batches.length === 0 && <p className="text-sm text-muted-foreground">No batches yet.</p>}
          {batches.map((b) => (
            <div key={b.id} className="rounded-lg border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div><p className="font-mono text-sm font-medium">{b.reference}</p><p className="text-xs text-muted-foreground">{b.legalEntity.code} · {b.payments.length} payment(s) · pay date {date(b.paymentDate)}</p></div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular">{money(b.totalAmount, b.currency)}</span><GenericBadge value={b.status} />
                  {b.status === "DRAFT" && <Button size="sm" onClick={() => act(() => apiFetch(`/api/v1/payments/batches/${b.id}/initiate`, { method: "POST" }))}>Release to bank</Button>}
                  {b.status === "INITIATED" && <Button size="sm" variant="success" onClick={() => act(() => apiFetch(`/api/v1/payments/batches/${b.id}/complete`, { method: "POST", json: { results: b.payments.map((p) => ({ paymentId: p.id, status: refs[`fail:${p.id}`] ? "FAILED" : "PAID", bankReference: refs[p.id] || null })) } }))}>Record bank results</Button>}
                </div>
              </div>
              <Table><TBody>{b.payments.map((p) => (
                <TR key={p.id}><TD>{p.report.number}</TD><TD>{p.report.employee.name}</TD><TD className="text-right tabular">{money(p.amount, b.currency)}</TD><TD><GenericBadge value={p.status} /></TD>
                  <TD className="w-64">{b.status === "INITIATED" ? (
                    <div className="flex items-center gap-2"><Input className="h-8 text-xs" placeholder="Bank reference" value={refs[p.id] ?? ""} onChange={(e) => setRefs({ ...refs, [p.id]: e.target.value })} />
                      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!refs[`fail:${p.id}`]} onChange={(e) => setRefs({ ...refs, [`fail:${p.id}`]: e.target.checked ? "1" : "" })} />failed</label></div>
                  ) : <span className="text-xs text-muted-foreground">{p.bankReference}</span>}</TD>
                </TR>))}</TBody></Table>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
