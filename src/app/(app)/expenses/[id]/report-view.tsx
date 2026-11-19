"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeftRight, Check, FileText, MessageSquare, Paperclip, Pencil, Plus, Send, Trash2, Undo2, UserRoundCog, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionBadge, ReportStatusBadge, SeverityBadge, GenericBadge } from "@/components/app/status";
import { apiFetch, errorMessage, ApiError } from "@/lib/client-api";
import { date, dateTime, money } from "@/lib/format";
import { LineForm, type Reference, type LineData } from "./line-form";
import { ReceiptViewer } from "./receipt-viewer";
import { UserPicker } from "@/components/app/user-picker";

type Finding = { key: string; ruleType: string; expenseId: string | null; action: string; severity: string; message: string };
interface Task { id: string; sequence: number; name: string; status: string; approver: { id: string; name: string }; originalApproverId: string | null; decidedAt: string | null; comment: string | null; dueAt: string | null; escalationLevel: number }
interface Violation { id: string; expenseId: string | null; ruleType: string; severity: string; action: string; message: string; status: string; justification: string | null; decisionNote: string | null; expense: { lineNo: number } | null }
interface Line extends LineData { id: string; lineNo: number; category: { name: string; isMileage: boolean }; costCenter: { code: string }; project: { code: string } | null; receipt: { id: string; fileName: string } | null; functionalAmount: string; reportingAmount: string; fxRateFunctional: string; fxSourceFunctional: string; fxOverridden: boolean; fxOverrideReason: string | null; reimbursable: boolean }
interface Data {
  actorId: string;
  authors: Record<string, string>;
  reference: Reference | null;
  permissions: { isOwner: boolean; canEdit: boolean; canSubmit: boolean; canWithdraw: boolean; canRespondInfo: boolean; pendingTaskId: string | null; canDecideExceptions: boolean; canOverrideFx: boolean };
  report: {
    id: string; number: string; title: string; purpose: string | null; status: string; accountingStatus: string; currency: string; reportingCurrency: string; version: number;
    totalFunctional: string; totalReporting: string; reimbursableAmount: string; advanceApplied: string; netPayable: string; submittedAt: string | null; approvedAt: string | null; paidAt: string | null;
    employee: { name: string; employeeNumber: string | null }; legalEntity: { code: string; name: string }; trip: { destinationCity: string; purpose: string } | null;
    expenses: Line[]; tasks: Task[]; violations: Violation[];
    comments: { id: string; authorId: string; body: string; kind: string; createdAt: string }[];
    payments: { id: string; amount: string; status: string; bankReference: string | null; paidAt: string | null; batch: { reference: string } }[];
    settlements: { amount: string; advance: { number: string } }[];
  };
}

export function ReportView({ data }: { data: Data }) {
  const router = useRouter();
  const { report: r, permissions: p } = data;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Line | "new" | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [decision, setDecision] = useState<"APPROVE" | "REJECT" | "REQUEST_INFO" | null>(null);
  const [fxLine, setFxLine] = useState<Line | null>(null);
  const [exception, setException] = useState<Violation | null>(null);
  const [reassign, setReassign] = useState(false);
  const [viewReceipt, setViewReceipt] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      after?.();
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const cur = r.currency;
  const exceptionsOpen = r.violations.filter((v) => v.action === "REQUIRE_EXCEPTION" && v.status === "OPEN").length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">{r.number}</span><ReportStatusBadge status={r.status} />
            {r.accountingStatus === "EXPORTED" && <Badge variant="secondary">Posted to ERP</Badge>}
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{r.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{r.employee.name} · {r.legalEntity.code} {r.legalEntity.name}{r.trip ? ` · Trip: ${r.trip.destinationCity}` : ""}</p>
          {r.purpose && <p className="mt-2 max-w-2xl text-sm">{r.purpose}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {p.canEdit && <Button variant="outline" onClick={() => setEditing("new")}><Plus />Add expense</Button>}
          {p.canSubmit && <Button onClick={() => setSubmitOpen(true)}><Send />Submit for approval</Button>}
          {p.canWithdraw && <Button variant="outline" disabled={busy} onClick={() => run(() => apiFetch(`/api/v1/reports/${r.id}/withdraw`, { method: "POST" }))}><Undo2 />Withdraw</Button>}
          {p.canEdit && r.status === "DRAFT" && !r.submittedAt && (
            <Button variant="ghost" disabled={busy} onClick={() => confirm("Delete this draft permanently?") && run(() => apiFetch(`/api/v1/reports/${r.id}`, { method: "DELETE" }), () => router.push("/expenses"))}><Trash2 />Delete</Button>
          )}
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {p.pendingTaskId && (
        <Card className="border-primary/40 bg-accent/40">
          <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Your decision is required</p>
              <p className="text-xs text-muted-foreground">{exceptionsOpen ? `${exceptionsOpen} policy exception(s) still need a Finance decision before final approval.` : "Review the lines, receipts and policy findings below."}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="success" onClick={() => setDecision("APPROVE")}><Check />Approve</Button>
              <Button variant="outline" onClick={() => setDecision("REQUEST_INFO")}><MessageSquare />Request info</Button>
              <Button variant="destructive" onClick={() => setDecision("REJECT")}><X />Reject</Button>
              <Button variant="ghost" onClick={() => setReassign(true)} title="Delegate this approval"><UserRoundCog /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {p.canRespondInfo && <InfoResponse reportId={r.id} lastRequest={[...r.comments].reverse().find((c) => c.kind === "INFO_REQUEST")?.body} onDone={() => router.refresh()} />}

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Totals label="Total" value={money(r.totalFunctional, cur)} sub={cur !== r.reportingCurrency ? `${money(r.totalReporting, r.reportingCurrency)} group currency` : undefined} />
        <Totals label="Reimbursable" value={money(r.reimbursableAmount, cur)} sub={Number(r.totalFunctional) - Number(r.reimbursableAmount) > 0 ? `${money(Number(r.totalFunctional) - Number(r.reimbursableAmount), cur)} paid by company` : undefined} />
        <Totals label="Advance offset" value={money(r.advanceApplied, cur)} sub={r.settlements.map((s) => s.advance.number).join(", ") || undefined} />
        <Totals label="Net payable" value={money(r.netPayable, cur)} sub={r.paidAt ? `Paid ${date(r.paidAt)}` : r.approvedAt ? `Approved ${date(r.approvedAt)}` : undefined} />
      </div>

      {/* Lines */}
      <Card>
        <CardHeader><CardTitle>Expenses</CardTitle><CardDescription>Original amounts are kept; conversions use the rate effective on the expense date.</CardDescription></CardHeader>
        {r.expenses.length === 0 ? <CardContent><p className="text-sm text-muted-foreground">No expenses yet. {p.canEdit && "Add your first expense and attach the receipt."}</p></CardContent> : (
          <Table>
            <THead><TR><TH>#</TH><TH>Date</TH><TH>Category</TH><TH>Merchant / description</TH><TH>Allocation</TH><TH className="text-right">Original</TH><TH className="text-right">In {cur}</TH><TH>Receipt</TH><TH /></TR></THead>
            <TBody>{r.expenses.map((l) => {
              const findings = r.violations.filter((v) => v.expenseId === l.id);
              return (
                <TR key={l.id}>
                  <TD className="text-muted-foreground">{l.lineNo}</TD>
                  <TD className="whitespace-nowrap">{date(l.expenseDate)}</TD>
                  <TD>{l.category.name}{!l.reimbursable && <p className="text-[11px] text-muted-foreground">company paid</p>}</TD>
                  <TD className="max-w-72">
                    <p className="truncate font-medium">{l.merchant}</p>
                    <p className="truncate text-xs text-muted-foreground">{l.description}{l.distanceKm ? ` · ${l.distanceKm} km` : ""}{l.nights ? ` · ${l.nights} night(s)` : ""}</p>
                    {findings.map((f) => <p key={f.id} className="mt-0.5 flex items-center gap-1 text-[11px] text-destructive"><AlertTriangle className="size-3" />{f.ruleType.replaceAll("_", " ").toLowerCase()}</p>)}
                  </TD>
                  <TD className="text-xs">{l.costCenter.code}{l.project && <p className="text-muted-foreground">{l.project.code}</p>}</TD>
                  <TD className="text-right tabular">{money(l.grossAmount, l.currency)}{Number(l.taxAmount) > 0 && <p className="text-[11px] text-muted-foreground">tax {money(l.taxAmount, l.currency)}</p>}</TD>
                  <TD className="text-right tabular">
                    {money(l.functionalAmount, cur)}
                    {l.currency !== cur && <p className={`text-[11px] ${l.fxOverridden ? "text-[color-mix(in_oklch,var(--warning),black_30%)]" : "text-muted-foreground"}`} title={l.fxOverrideReason ?? undefined}>@ {Number(l.fxRateFunctional).toFixed(5)} {l.fxSourceFunctional}</p>}
                  </TD>
                  <TD>{l.receipt ? <button onClick={() => setViewReceipt(l.receipt!.id)} className="flex items-center gap-1 text-xs text-primary hover:underline"><Paperclip className="size-3" />View</button> : <span className="text-xs text-muted-foreground">{l.category.isMileage ? "n/a" : "missing"}</span>}</TD>
                  <TD className="whitespace-nowrap text-right">
                    {p.canEdit && <>
                      <Button size="icon" variant="ghost" onClick={() => setEditing(l)} aria-label={`Edit line ${l.lineNo}`}><Pencil /></Button>
                      <Button size="icon" variant="ghost" disabled={busy} onClick={() => run(() => apiFetch(`/api/v1/reports/${r.id}/expenses/${l.id}`, { method: "DELETE" }))} aria-label={`Delete line ${l.lineNo}`}><Trash2 /></Button>
                    </>}
                    {p.canOverrideFx && l.currency !== cur && <Button size="icon" variant="ghost" onClick={() => setFxLine(l)} aria-label="Override exchange rate" title="Override exchange rate"><ArrowLeftRight /></Button>}
                  </TD>
                </TR>
              );
            })}</TBody>
          </Table>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Policy findings */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Policy & control findings</CardTitle><CardDescription>Blocking findings prevent submission; exceptions need a justification and a Finance decision.</CardDescription></CardHeader>
          <CardContent>
            {r.violations.length === 0 ? <p className="text-sm text-muted-foreground">{r.submittedAt ? "No findings — compliant with policy." : "Findings are evaluated when you submit (use “Submit for approval” to preview)."}</p> : (
              <ul className="divide-y">{r.violations.map((v) => (
                <li key={v.id} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5"><SeverityBadge severity={v.severity} /><ActionBadge action={v.action} />{v.action === "REQUIRE_EXCEPTION" && <GenericBadge value={v.status} />}</div>
                    <p className="text-sm">{v.message}</p>
                    {v.justification && <p className="text-xs text-muted-foreground">Employee: “{v.justification}”</p>}
                    {v.decisionNote && <p className="text-xs text-muted-foreground">Finance: “{v.decisionNote}”</p>}
                  </div>
                  {p.canDecideExceptions && v.action === "REQUIRE_EXCEPTION" && v.status === "OPEN" && <Button size="sm" variant="outline" onClick={() => setException(v)}>Decide exception</Button>}
                </li>))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Approval timeline */}
        <Card>
          <CardHeader><CardTitle>Approval workflow</CardTitle></CardHeader>
          <CardContent>
            {r.tasks.length === 0 ? <p className="text-sm text-muted-foreground">Routing is determined on submission from the configured approval matrix.</p> : (
              <ol className="relative space-y-4 border-l pl-4">{r.tasks.map((t) => (
                <li key={t.id} className="relative">
                  <span className={`absolute -left-[21px] top-1 size-2.5 rounded-full ring-2 ring-card ${t.status === "APPROVED" ? "bg-success" : t.status === "REJECTED" ? "bg-destructive" : t.status === "PENDING" || t.status === "INFO_REQUESTED" ? "bg-primary" : "bg-muted-foreground/40"}`} />
                  <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{t.name}</p><GenericBadge value={t.status} /></div>
                  <p className="text-xs text-muted-foreground">{t.approver.name}{t.originalApproverId ? " (delegated/escalated)" : ""}{t.decidedAt ? ` · ${dateTime(t.decidedAt)}` : t.dueAt && t.status === "PENDING" ? ` · due ${dateTime(t.dueAt)}` : ""}</p>
                  {t.comment && <p className="mt-1 text-xs italic">“{t.comment}”</p>}
                </li>))}
              </ol>
            )}
            {r.payments.length > 0 && (
              <div className="mt-4 border-t pt-3 text-xs">
                {r.payments.map((pm) => <p key={pm.id} className="flex justify-between"><span>Payment {pm.batch.reference}{pm.bankReference ? ` · ${pm.bankReference}` : ""}</span><GenericBadge value={pm.status} /></p>)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Comments reportId={r.id} comments={r.comments} authors={data.authors} onDone={() => router.refresh()} />

      {/* Dialogs */}
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Add expense" : `Edit line ${editing ? editing.lineNo : ""}`} className="w-[min(760px,calc(100vw-2rem))]">
        {editing && data.reference && <LineForm reportId={r.id} reference={data.reference} line={editing === "new" ? null : editing} onSaved={() => { setEditing(null); router.refresh(); }} />}
      </Dialog>
      <SubmitDialog open={submitOpen} onClose={() => setSubmitOpen(false)} reportId={r.id} version={r.version} onDone={() => { setSubmitOpen(false); router.refresh(); }} />
      <DecisionDialog decision={decision} onClose={() => setDecision(null)} taskId={p.pendingTaskId} onDone={() => { setDecision(null); router.refresh(); }} />
      <Dialog open={!!fxLine} onClose={() => setFxLine(null)} title="Override exchange rate" description="Requires justification. Deviation is capped and every override is audited with its FX impact.">
        {fxLine && <FxOverride reportId={r.id} line={fxLine} currency={cur} onDone={() => { setFxLine(null); router.refresh(); }} />}
      </Dialog>
      <Dialog open={!!exception} onClose={() => setException(null)} title="Policy exception decision" description="A written justification is mandatory and recorded in the audit trail.">
        {exception && <ExceptionDecision violation={exception} onDone={() => { setException(null); router.refresh(); }} />}
      </Dialog>
      <Dialog open={reassign} onClose={() => setReassign(false)} title="Delegate this approval" description="The approval moves to the selected colleague. It can never be routed to the claimant.">
        {reassign && p.pendingTaskId && <Reassign taskId={p.pendingTaskId} onDone={() => { setReassign(false); router.refresh(); }} />}
      </Dialog>
      <ReceiptViewer receiptId={viewReceipt} onClose={() => setViewReceipt(null)} />
    </div>
  );
}

function Totals({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3.5 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular">{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={sub}>{sub}</p>}
    </div>
  );
}

function SubmitDialog({ open, onClose, reportId, version, onDone }: { open: boolean; onClose: () => void; reportId: string; version: number; onDone: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Submit for approval" description="Your report is checked against the expense policy before it is routed to approvers.">
      <SubmitBody reportId={reportId} version={version} onDone={onDone} />
    </Dialog>
  );
}

function SubmitBody({ reportId, version, onDone }: { reportId: string; version: number; onDone: () => void }) {
  const [check, setCheck] = useState<{ canSubmit: boolean; blocking: Finding[]; exceptions: Finding[]; warnings: Finding[] } | null>(null);
  const [just, setJust] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    apiFetch<typeof check>(`/api/v1/reports/${reportId}/policy-check`).then(setCheck).catch((e) => setError(errorMessage(e)));
  }, [reportId]);
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/reports/${reportId}/submit`, { method: "POST", json: { version, justifications: just } });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError && e.code === "CONFLICT" ? `${e.message}` : errorMessage(e));
      setBusy(false);
    }
  }
  if (!check) return <p className="text-sm text-muted-foreground">{error ?? "Checking policy…"}</p>;
  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {check.blocking.length > 0 && (
        <Alert tone="error" title="Fix these issues before submitting">
          <ul className="mt-1 list-disc pl-4">{check.blocking.map((f) => <li key={f.key + f.message}>{f.message}</li>)}</ul>
        </Alert>
      )}
      {check.exceptions.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Out-of-policy items — justification required</p>
          {check.exceptions.map((f) => (
            <Field key={f.key} label={f.message}>
              <Textarea value={just[f.key] ?? ""} onChange={(e) => setJust({ ...just, [f.key]: e.target.value })} placeholder="Explain the business reason (min. 10 characters)" className="min-h-14" />
            </Field>
          ))}
        </div>
      )}
      {check.warnings.length > 0 && (
        <Alert tone="warning" title="Warnings (for information)"><ul className="mt-1 list-disc pl-4">{check.warnings.map((f) => <li key={f.key + f.message}>{f.message}</li>)}</ul></Alert>
      )}
      {check.blocking.length === 0 && check.exceptions.length === 0 && check.warnings.length === 0 && <Alert tone="success">No policy issues detected.</Alert>}
      <div className="flex justify-end gap-2">
        <Button onClick={submit} disabled={busy || !check.canSubmit}>{busy ? "Submitting…" : "Submit"}</Button>
      </div>
    </div>
  );
}

function DecisionDialog({ decision, onClose, taskId, onDone }: { decision: "APPROVE" | "REJECT" | "REQUEST_INFO" | null; onClose: () => void; taskId: string | null; onDone: () => void }) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const title = decision === "APPROVE" ? "Approve report" : decision === "REJECT" ? "Reject report" : "Request additional information";
  async function go() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/approvals/${taskId}/decision`, { method: "POST", json: { decision, comment: comment || null } });
      setComment("");
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={!!decision} onClose={onClose} title={title}>
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label={decision === "APPROVE" ? "Comment (optional)" : "Comment (required — visible to the employee)"}><Textarea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
        <div className="flex justify-end"><Button variant={decision === "REJECT" ? "destructive" : decision === "APPROVE" ? "success" : "default"} disabled={busy} onClick={go}>{busy ? "Saving…" : title}</Button></div>
      </div>
    </Dialog>
  );
}

function FxOverride({ reportId, line, currency, onDone }: { reportId: string; line: Line; currency: string; onDone: () => void }) {
  const [rate, setRate] = useState(Number(line.fxRateFunctional).toFixed(6));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const newAmount = Number(line.grossAmount) * Number(rate || 0);
  async function go() {
    try {
      await apiFetch(`/api/v1/reports/${reportId}/expenses/${line.id}/fx-override`, { method: "POST", json: { rate, reason } });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-sm">Line {line.lineNo}: {money(line.grossAmount, line.currency)} at reference rate {Number(line.fxRateFunctional).toFixed(6)} = {money(line.functionalAmount, currency)}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`New rate (1 ${line.currency} = ? ${currency})`}><Input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" /></Field>
        <Field label="Resulting amount / FX impact"><span className="block py-2 text-sm tabular">{money(newAmount, currency)} ({newAmount - Number(line.functionalAmount) >= 0 ? "+" : ""}{(newAmount - Number(line.functionalAmount)).toFixed(2)})</span></Field>
      </div>
      <Field label="Justification"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Corporate card statement shows the bank's applied rate" /></Field>
      <div className="flex justify-end"><Button onClick={go}>Apply override</Button></div>
    </div>
  );
}

function ExceptionDecision({ violation, onDone }: { violation: Violation; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function go(approve: boolean) {
    try {
      await apiFetch(`/api/v1/exceptions/${violation.id}/decision`, { method: "POST", json: { approve, note } });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <p className="text-sm">{violation.message}</p>
      {violation.justification && <p className="rounded-md bg-muted p-2 text-sm">Employee justification: “{violation.justification}”</p>}
      <Field label="Finance justification (mandatory)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="flex justify-end gap-2">
        <Button variant="destructive" onClick={() => go(false)}>Reject exception</Button>
        <Button variant="success" onClick={() => go(true)}>Approve exception</Button>
      </div>
    </div>
  );
}

function Reassign({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function go() {
    try {
      await apiFetch(`/api/v1/approvals/${taskId}/reassign`, { method: "POST", json: { toUserId: user?.id, reason } });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <UserPicker value={user} onChange={setUser} />
      <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Out of office until Monday" /></Field>
      <div className="flex justify-end"><Button disabled={!user || reason.length < 5} onClick={go}>Delegate</Button></div>
    </div>
  );
}

function InfoResponse({ reportId, lastRequest, onDone }: { reportId: string; lastRequest?: string; onDone: () => void }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function go() {
    try {
      await apiFetch(`/api/v1/reports/${reportId}/respond`, { method: "POST", json: { body } });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Card className="border-warning/50">
      <CardContent className="space-y-3 pt-5">
        <p className="text-sm font-medium">Additional information requested</p>
        {lastRequest && <p className="rounded-md bg-muted p-2 text-sm">“{lastRequest}”</p>}
        {error && <Alert tone="error">{error}</Alert>}
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your answer to the approver" />
        <div className="flex justify-end"><Button disabled={!body.trim()} onClick={go}><Send />Send and resume approval</Button></div>
      </CardContent>
    </Card>
  );
}

function Comments({ reportId, comments, authors, onDone }: { reportId: string; comments: Data["report"]["comments"]; authors: Record<string, string>; onDone: () => void }) {
  const [body, setBody] = useState("");
  async function go() {
    await apiFetch(`/api/v1/reports/${reportId}/comments`, { method: "POST", json: { body } });
    setBody("");
    onDone();
  }
  return (
    <Card>
      <CardHeader><CardTitle>Discussion & history</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
        {comments.map((c) => (
          <div key={c.id} className={`rounded-md border p-3 text-sm ${c.kind === "SYSTEM" ? "bg-muted/60 text-muted-foreground" : ""}`}>
            <p className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><FileText className="size-3" /><span className="font-medium text-foreground">{c.kind === "SYSTEM" ? "System" : authors[c.authorId] ?? "User"}</span>{c.kind === "INFO_REQUEST" && <Badge variant="warning">info request</Badge>}{c.kind === "INFO_RESPONSE" && <Badge>response</Badge>}<span>{dateTime(c.createdAt)}</span></p>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </div>
        ))}
        <div className="flex gap-2"><Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" /><Button variant="outline" disabled={!body.trim()} onClick={go}>Post</Button></div>
      </CardContent>
    </Card>
  );
}
