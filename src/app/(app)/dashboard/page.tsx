import Link from "next/link";
import { pageActor } from "@/server/auth/page";
import { can, scopeFor } from "@/server/auth/scope";
import { analytics, budgetSummary, employeeSummary, managerSummary } from "@/server/services/dashboard-service";
import { filtersFromSearch } from "@/server/services/dashboard-filters";
import { orgFilterOptions } from "@/server/services/reference-service";
import { PageHeader, Stat, Alert, Progress } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { ReportStatusBadge, SeverityBadge } from "@/components/app/status";
import { BreakdownBars, TrendChart } from "@/components/app/charts";
import { FilterBar } from "@/components/app/filter-bar";
import { compactMoney, date, money, pct } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await pageActor();
  const sp = await searchParams;
  const filters = filtersFromSearch(sp);
  const isEmployee = can(actor, "report:create");
  const view = can(actor, "dashboard:executive") ? "executive" : can(actor, "dashboard:finance") ? "finance" : can(actor, "dashboard:team") ? "team" : null;
  const permission = view === "executive" ? "dashboard:executive" : view === "finance" ? "dashboard:finance" : "dashboard:team";

  const [emp, mgr] = await Promise.all([isEmployee ? employeeSummary(actor) : null, managerSummary(actor)]);
  let data = null, budgets = null, options = null;
  if (view) {
    const finScope = await scopeFor(actor, permission);
    const entityIds = finScope.all ? "all" as const : finScope.entityIds.size ? [...finScope.entityIds] : [actor.legalEntityId];
    [data, budgets, options] = await Promise.all([
      analytics(actor, permission, filters),
      view !== "team" ? budgetSummary(actor, Number(filters.to.slice(0, 4)), filters.legalEntityId) : null,
      orgFilterOptions(actor, entityIds),
    ]);
  }
  const heading = view === "executive" ? "Group executive dashboard" : view === "finance" ? "Finance control dashboard" : "Dashboard";

  return (
    <div>
      <PageHeader title={heading} description={`Welcome back, ${actor.name.split(" ")[0]}.`}
        actions={isEmployee && <Link href="/expenses/new" className={buttonVariants()}>New expense report</Link>} />
      {sp.denied && <Alert tone="warning" className="mb-4">You do not have access to that page.</Alert>}

      {emp && (
        <section aria-labelledby="my-expenses" className="mb-8">
          <h2 id="my-expenses" className="mb-3 text-sm font-semibold text-muted-foreground">My expenses</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Submitted (all time)" value={money(emp.submitted, emp.currency)} />
            <Stat label="Pending approval" value={money(emp.pending.amount, emp.currency)} sub={`${emp.pending.count} report(s)`} />
            <Stat label="To be reimbursed" value={money(emp.toBeReimbursed, emp.currency)} sub={`${emp.approved.count} approved`} tone="success" />
            <Stat label="Paid" value={money(emp.paid.amount, emp.currency)} sub={`${emp.paid.count} report(s)`} />
            <Stat label="Outstanding advances" value={money(emp.outstandingAdvances, emp.currency)} sub={emp.drafts ? `${emp.drafts} draft/returned report(s)` : undefined} />
          </div>
          {emp.infoRequested > 0 && <Alert tone="warning" className="mt-3" title="Action needed">An approver requested more information on {emp.infoRequested} of your reports.</Alert>}
          {emp.recent.length > 0 && (
            <Card className="mt-3">
              <Table>
                <THead><TR><TH>Report</TH><TH>Title</TH><TH>Status</TH><TH className="text-right">Amount</TH><TH>Updated</TH></TR></THead>
                <TBody>{emp.recent.map((r) => (
                  <TR key={r.id}>
                    <TD><Link className="font-medium text-primary hover:underline" href={`/expenses/${r.id}`}>{r.number}</Link></TD>
                    <TD className="max-w-64 truncate">{r.title}</TD>
                    <TD><ReportStatusBadge status={r.status} /></TD>
                    <TD className="text-right tabular">{money(r.totalFunctional, r.currency)}</TD>
                    <TD className="text-muted-foreground">{date(r.updatedAt)}</TD>
                  </TR>))}
                </TBody>
              </Table>
            </Card>
          )}
        </section>
      )}

      {mgr.pending > 0 && (
        <section aria-labelledby="approvals" className="mb-8">
          <h2 id="approvals" className="mb-3 text-sm font-semibold text-muted-foreground">Approvals</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <Stat label="Waiting for my approval" value={mgr.pending} sub={<Link href="/approvals" className="text-primary hover:underline">Open inbox →</Link>} />
            <Stat label="Overdue (past SLA)" value={mgr.overdue} tone={mgr.overdue ? "destructive" : "default"} />
            <Card><CardHeader><CardTitle>Approval aging</CardTitle></CardHeader><CardContent className="space-y-1.5">
              {mgr.aging.map((a) => (
                <div key={a.bucket} className="flex items-center gap-2 text-xs"><span className="w-16 text-muted-foreground">{a.bucket}</span><Progress value={mgr.pending ? (a.count / mgr.pending) * 100 : 0} tone={a.bucket === "> 7 days" ? "destructive" : "default"} /><span className="w-6 text-right tabular">{a.count}</span></div>
              ))}
            </CardContent></Card>
          </div>
        </section>
      )}

      {data && options && (
        <section aria-labelledby="analytics">
          <h2 id="analytics" className="mb-3 text-sm font-semibold text-muted-foreground">
            {view === "team" ? "Team spending" : "Spending analytics"} · amounts in {data.currency}
          </h2>
          <FilterBar view={view!} options={{
            countries: options.countries.map((c) => ({ value: c.code, label: c.name })),
            entities: options.entities.map((e) => ({ value: e.id, label: e.code })),
            departments: [...new Map(options.departments.map((d) => [d.id, { value: d.id, label: d.name + (options.entities.length > 1 ? ` (${options.entities.find((e) => e.id === d.legalEntityId)?.code})` : "") }])).values()],
            costCenters: options.costCenters.map((c) => ({ value: c.id, label: c.code })),
            categories: options.categories.map((c) => ({ value: c.id, label: c.name })),
            currencies: ["EUR", "USD", "GBP", "MAD", "AED", "CHF"].map((c) => ({ value: c, label: c })),
          }} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Total expenses" value={compactMoney(data.totals.amount, data.currency)} sub={`${data.totals.reports} reports · ${data.totals.lines} lines`} />
            <Stat label="Policy compliance rate" value={pct(data.totals.complianceRate)} sub={`${data.totals.outOfPolicyLines} out-of-policy lines`} tone={data.totals.complianceRate < 80 ? "warning" : "success"} />
            <Stat label="Outstanding employee liabilities" value={compactMoney(data.totals.outstandingLiabilities, data.currency)} sub="Approved, not yet paid" />
            <Stat label="Reimbursement cycle" value={data.totals.avgCycleDays != null ? `${data.totals.avgCycleDays} days` : "—"} sub={`${data.totals.pendingReview} report(s) pending review`} />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <TrendChart data={data.trend} currency={data.currency} />
            <BreakdownBars title="Top spending categories" data={data.byCategory} currency={data.currency} />
            {view !== "team" && data.byEntity.length > 1 && <BreakdownBars title="Expenses by legal entity" data={data.byEntity} currency={data.currency} />}
            {view !== "team" && data.byCountry.length > 1 && <BreakdownBars title="Expenses by country" data={data.byCountry} currency={data.currency} />}
            <BreakdownBars title="Expenses by department" data={data.byDepartment} currency={data.currency} />
            <BreakdownBars title="Expenses by cost center" data={data.byCostCenter} currency={data.currency} />
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Currency exposure</CardTitle><CardDescription>Original transaction amounts and their {data.currency} equivalent</CardDescription></CardHeader>
              <Table><THead><TR><TH>Currency</TH><TH className="text-right">Original</TH><TH className="text-right">In {data.currency}</TH><TH className="text-right">Share</TH><TH className="text-right">Lines</TH></TR></THead>
                <TBody>{data.byCurrency.map((c) => (
                  <TR key={c.currency}><TD className="font-medium">{c.currency}</TD><TD className="text-right tabular">{money(c.original, c.currency)}</TD><TD className="text-right tabular">{money(c.reporting, data.currency)}</TD><TD className="text-right tabular">{pct(data.totals.amount ? (c.reporting / data.totals.amount) * 100 : 0)}</TD><TD className="text-right tabular">{c.count}</TD></TR>
                ))}</TBody></Table>
            </Card>
            <Card>
              <CardHeader><CardTitle>Policy findings</CardTitle><CardDescription>Reports submitted in the period</CardDescription></CardHeader>
              <CardContent>
                {data.violations.length === 0 ? <p className="text-xs text-muted-foreground">No findings.</p> : (
                  <ul className="space-y-2 text-sm">{data.violations.sort((a, b) => b.count - a.count).map((v) => (
                    <li key={v.severity + v.action} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><SeverityBadge severity={v.severity} /><span className="text-xs text-muted-foreground">{v.action === "WARN" ? "warning" : v.action === "BLOCK" ? "blocking" : "exception"}</span></span><span className="tabular font-medium">{v.count}</span></li>
                  ))}</ul>
                )}
              </CardContent>
            </Card>
          </div>

          {budgets && budgets.items.length > 0 && (
            <Card className="mt-3">
              <CardHeader>
                <CardTitle>Budget vs actual — FY{filters.to.slice(0, 4)}</CardTitle>
                <CardDescription>Budget {money(budgets.totals.budget, budgets.currency)} · actual {money(budgets.totals.actual, budgets.currency)} · pending {money(budgets.totals.pending, budgets.currency)} · forecast at completion {money(budgets.totals.forecast, budgets.currency)}</CardDescription>
              </CardHeader>
              <Table><THead><TR><TH>Budget</TH><TH>Entity</TH><TH className="text-right">Budget</TH><TH className="text-right">Actual</TH><TH className="text-right">Forecast</TH><TH className="w-48">Consumption</TH></TR></THead>
                <TBody>{budgets.items.slice(0, 10).map((b) => (
                  <TR key={b.entity + b.code}>
                    <TD><Link href="/budgets" className="font-medium hover:underline">{b.code}</Link><p className="text-xs text-muted-foreground">{b.name}</p></TD>
                    <TD>{b.entity}</TD>
                    <TD className="text-right tabular">{money(b.budget, budgets.currency)}</TD>
                    <TD className="text-right tabular">{money(b.actual, budgets.currency)}</TD>
                    <TD className={`text-right tabular ${b.forecast > b.budget ? "text-destructive" : ""}`}>{money(b.forecast, budgets.currency)}</TD>
                    <TD><div className="flex items-center gap-2"><Progress value={b.consumptionPct} tone={b.alertLevel >= 100 ? "destructive" : b.alertLevel >= 80 ? "warning" : "default"} /><span className="w-12 text-right text-xs tabular">{pct(b.consumptionPct)}</span>{b.alertLevel > 0 && <Badge variant={b.alertLevel >= 100 ? "destructive" : "warning"}>≥{b.alertLevel}%</Badge>}</div></TD>
                  </TR>))}
                </TBody></Table>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
