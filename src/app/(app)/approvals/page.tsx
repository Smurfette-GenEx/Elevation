import Link from "next/link";
import { pageActor } from "@/server/auth/page";
import { listMyTasks, listDelegations } from "@/server/services/approval-service";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ReportStatusBadge } from "@/components/app/status";
import { date, money } from "@/lib/format";
import { DelegationPanel } from "./delegations";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const actor = await pageActor();
  const [tasks, history, delegations] = await Promise.all([listMyTasks(actor), listMyTasks(actor, { includeDecided: true }), listDelegations(actor)]);
  const now = Date.now();
  return (
    <div className="space-y-6">
      <PageHeader title="Approvals" description="Expense reports waiting for your decision, oldest first." />
      {tasks.length === 0 ? <EmptyState title="You're all caught up" description="New approval requests will appear here and in your notifications." /> : (
        <Card>
          <Table>
            <THead><TR><TH>Report</TH><TH>Employee</TH><TH>Entity</TH><TH>Step</TH><TH className="text-right">Amount</TH><TH>Findings</TH><TH>Waiting since</TH><TH>Status</TH></TR></THead>
            <TBody>{tasks.map((t) => {
              const overdue = t.dueAt && t.dueAt.getTime() < now && t.status === "PENDING";
              const exceptions = t.report.violations.filter((v) => v.action === "REQUIRE_EXCEPTION").length;
              const serious = t.report.violations.filter((v) => v.severity === "HIGH" || v.severity === "CRITICAL").length;
              return (
                <TR key={t.id}>
                  <TD><Link href={`/expenses/${t.reportId}`} className="font-medium text-primary hover:underline">{t.report.number}</Link><p className="max-w-56 truncate text-xs text-muted-foreground">{t.report.title}</p></TD>
                  <TD>{t.report.employee.name}</TD>
                  <TD>{t.report.legalEntity.code}</TD>
                  <TD>{t.name}{t.originalApproverId && <p className="text-[11px] text-muted-foreground">delegated / escalated</p>}</TD>
                  <TD className="text-right tabular font-medium">{money(t.report.totalFunctional, t.report.currency)}</TD>
                  <TD>{t.report.violations.length === 0 ? <Badge variant="success">compliant</Badge> : <span className="flex gap-1">{exceptions > 0 && <Badge variant="warning">{exceptions} exception(s)</Badge>}{serious > 0 && <Badge variant="destructive">{serious} high</Badge>}</span>}</TD>
                  <TD className={overdue ? "text-destructive" : "text-muted-foreground"}>{date(t.activatedAt)}{overdue && <p className="text-[11px]">overdue</p>}</TD>
                  <TD>{t.status === "INFO_REQUESTED" ? <Badge variant="warning">awaiting employee</Badge> : <ReportStatusBadge status={t.report.status} />}</TD>
                </TR>
              );
            })}</TBody>
          </Table>
        </Card>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <DelegationPanel actorId={actor.id} delegations={JSON.parse(JSON.stringify(delegations))} />
        <Card>
          <CardHeader><CardTitle>Recently decided</CardTitle><CardDescription>Your last decisions</CardDescription></CardHeader>
          <CardContent>
            {history.length === 0 ? <p className="text-sm text-muted-foreground">No decisions yet.</p> : (
              <ul className="divide-y text-sm">{history.slice(0, 10).map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2"><Link href={`/expenses/${t.reportId}`} className="hover:underline">{t.report.number} · {t.report.employee.name}</Link><span className="flex items-center gap-2 text-xs text-muted-foreground">{date(t.decidedAt)}<Badge variant={t.status === "APPROVED" ? "success" : "destructive"}>{t.status.toLowerCase()}</Badge></span></li>
              ))}</ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
