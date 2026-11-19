import Link from "next/link";
import { pageActor } from "@/server/auth/page";
import { can } from "@/server/auth/scope";
import { listReports } from "@/server/services/report-service";
import type { ReportStatus } from "@/server/domain/approval-engine";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { ReportStatusBadge } from "@/components/app/status";
import { date, money } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Expense reports" };

const TABS = [
  { key: "mine", label: "My reports" },
  { key: "scope", label: "All I can see" },
];
const STATUS_FILTERS: { key: string; label: string; statuses?: ReportStatus[] }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts & returned", statuses: ["DRAFT", "REJECTED"] },
  { key: "pending", label: "In approval", statuses: ["SUBMITTED", "UNDER_REVIEW", "INFO_REQUESTED"] },
  { key: "approved", label: "Approved / payment", statuses: ["APPROVED", "READY_FOR_PAYMENT", "PAYMENT_INITIATED"] },
  { key: "paid", label: "Paid", statuses: ["PAID"] },
];

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string; q?: string; page?: string }> }) {
  const actor = await pageActor();
  const sp = await searchParams;
  const canSeeOthers = can(actor, "team:read") || can(actor, "finance:read") || can(actor, "department:read");
  const tab = sp.tab === "scope" && canSeeOthers ? "scope" : "mine";
  const st = STATUS_FILTERS.find((s) => s.key === sp.status) ?? STATUS_FILTERS[0];
  const page = Math.max(1, Number(sp.page ?? 1));
  const { items, total } = await listReports(actor, { mine: tab === "mine", status: st.statuses, q: sp.q, take: 25, skip: (page - 1) * 25 });
  const qs = (o: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ tab, status: st.key, q: sp.q, ...o }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div>
      <PageHeader title="Expense reports" description="Create, submit and track expense claims."
        actions={can(actor, "report:create") && <Link href="/expenses/new" className={buttonVariants()}>New report</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {canSeeOthers && TABS.map((t) => <Link key={t.key} href={qs({ tab: t.key, page: undefined })} className={cn(buttonVariants({ variant: tab === t.key ? "secondary" : "ghost", size: "sm" }))}>{t.label}</Link>)}
        {canSeeOthers && <span className="mx-1 h-5 w-px bg-border" />}
        {STATUS_FILTERS.map((s) => <Link key={s.key} href={qs({ status: s.key, page: undefined })} className={cn("rounded-full border px-3 py-1 text-xs", st.key === s.key ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted")}>{s.label}</Link>)}
        <form className="ml-auto"><input type="hidden" name="tab" value={tab} /><input name="q" defaultValue={sp.q} placeholder="Search number, title, employee…" className="h-8 w-64 rounded-md border border-input bg-card px-3 text-xs" /></form>
      </div>
      {items.length === 0 ? <EmptyState title="No expense reports" description="Reports you create or are allowed to review appear here." action={can(actor, "report:create") && <Link href="/expenses/new" className={buttonVariants({ size: "sm" })}>Create your first report</Link>} /> : (
        <Card>
          <Table>
            <THead><TR><TH>Number</TH><TH>Title</TH>{tab === "scope" && <TH>Employee</TH>}<TH>Entity</TH><TH>Status</TH><TH className="text-right">Lines</TH><TH className="text-right">Amount</TH><TH>Submitted</TH></TR></THead>
            <TBody>{items.map((r) => (
              <TR key={r.id}>
                <TD><Link href={`/expenses/${r.id}`} className="font-medium text-primary hover:underline">{r.number}</Link></TD>
                <TD className="max-w-72 truncate">{r.title}{r._count.violations > 0 && <span className="ml-2 text-xs text-muted-foreground">· {r._count.violations} finding(s)</span>}</TD>
                {tab === "scope" && <TD>{r.employee.name}</TD>}
                <TD>{r.legalEntity.code}</TD>
                <TD><ReportStatusBadge status={r.status} /></TD>
                <TD className="text-right tabular">{r._count.expenses}</TD>
                <TD className="text-right tabular font-medium">{money(r.totalFunctional, r.currency)}</TD>
                <TD className="text-muted-foreground">{date(r.submittedAt)}</TD>
              </TR>))}
            </TBody>
          </Table>
          <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
            <span>{total} report(s)</span>
            <span className="flex gap-2">
              {page > 1 && <Link href={qs({ page: String(page - 1) })} className="hover:underline">← Previous</Link>}
              {page * 25 < total && <Link href={qs({ page: String(page + 1) })} className="hover:underline">Next →</Link>}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
