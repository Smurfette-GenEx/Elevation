"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { dateTime } from "@/lib/format";

type Data = {
  entities: { id: string; code: string; name: string; erpFormat: string | null; readyExpenses: number; readyPayments: number; periods: { period: string; status: string }[] }[];
  exports: { id: string; kind: string; period: string; erpFormat: string; reportCount: number; lineCount: number; totalDebit: string; createdAt: string; legalEntity: { code: string } }[];
};

export function AccountingView({ data }: { data: Data }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const act = (fn: () => Promise<unknown>, msg: string) => { setError(null); setOk(null); fn().then(() => { setOk(msg); router.refresh(); }).catch((e) => setError(errorMessage(e))); };
  return (
    <div className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}
      {ok && <Alert tone="success">{ok}</Alert>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.entities.map((e) => (
          <Card key={e.id}>
            <CardHeader><CardTitle>{e.code} · {e.name}</CardTitle><CardDescription>ERP layout: {e.erpFormat ?? "not configured"}</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm"><span>Approved reports to recognise</span><span className="font-semibold tabular">{e.readyExpenses}</span></div>
              <div className="flex items-center justify-between text-sm"><span>Paid reimbursements to post</span><span className="font-semibold tabular">{e.readyPayments}</span></div>
              <div className="flex gap-2">
                <Button size="sm" disabled={!e.readyExpenses} onClick={() => act(() => apiFetch("/api/v1/accounting/exports", { method: "POST", json: { legalEntityId: e.id, kind: "EXPENSES" } }), `Expense journal generated for ${e.code}`)}>Export expenses</Button>
                <Button size="sm" variant="outline" disabled={!e.readyPayments} onClick={() => act(() => apiFetch("/api/v1/accounting/exports", { method: "POST", json: { legalEntityId: e.id, kind: "PAYMENTS" } }), `Payment journal generated for ${e.code}`)}>Export payments</Button>
              </div>
              <div className="border-t pt-3">
                <p className="mb-2 text-xs text-muted-foreground">Accounting periods (closed periods post into the next open one)</p>
                <div className="flex flex-wrap gap-1">{e.periods.map((p) => <Badge key={p.period} variant={p.status === "CLOSED" ? "secondary" : "success"}>{p.period} {p.status.toLowerCase()}</Badge>)}</div>
                <div className="mt-2 flex gap-2">
                  <Input type="month" value={period} onChange={(ev) => setPeriod(ev.target.value)} className="h-8 w-36 text-xs" aria-label="Period" />
                  <Button size="sm" variant="ghost" onClick={() => act(() => apiFetch("/api/v1/accounting/periods", { method: "POST", json: { legalEntityId: e.id, period, status: "CLOSED" } }), `${period} closed`)}>Close</Button>
                  <Button size="sm" variant="ghost" onClick={() => act(() => apiFetch("/api/v1/accounting/periods", { method: "POST", json: { legalEntityId: e.id, period, status: "OPEN" } }), `${period} reopened`)}>Reopen</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Export history</CardTitle><CardDescription>Downloads are logged in the audit trail.</CardDescription></CardHeader>
        <Table>
          <THead><TR><TH>Created</TH><TH>Entity</TH><TH>Type</TH><TH>Period</TH><TH>Format</TH><TH className="text-right">Reports</TH><TH className="text-right">Lines</TH><TH className="text-right">Total debit = credit</TH><TH /></TR></THead>
          <TBody>{data.exports.map((x) => (
            <TR key={x.id}>
              <TD>{dateTime(x.createdAt)}</TD><TD>{x.legalEntity.code}</TD><TD>{x.kind === "EXPENSES" ? "Expense recognition" : "Reimbursements"}</TD><TD>{x.period}</TD><TD>{x.erpFormat}</TD>
              <TD className="text-right tabular">{x.reportCount}</TD><TD className="text-right tabular">{x.lineCount}</TD><TD className="text-right tabular">{Number(x.totalDebit).toLocaleString("en-GB", { minimumFractionDigits: 2 })}</TD>
              <TD className="whitespace-nowrap text-right">
                <a className={buttonVariants({ size: "sm", variant: "ghost" })} href={`/api/v1/accounting/exports/${x.id}/download?format=csv`}><Download />CSV</a>
                <a className={buttonVariants({ size: "sm", variant: "ghost" })} href={`/api/v1/accounting/exports/${x.id}/download?format=xlsx`}><Download />Excel</a>
              </TD>
            </TR>))}
            {data.exports.length === 0 && <TR><TD colSpan={9} className="text-center text-muted-foreground">No exports yet.</TD></TR>}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
