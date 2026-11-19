import Link from "next/link";
import { pageActor } from "@/server/auth/page";
import { can } from "@/server/auth/scope";
import { ROLE_LABELS } from "@/server/auth/rbac";
import { listPolicyRules, listUsers, listWorkflows, orgOverview, queryAuditLog } from "@/server/services/admin-service";
import { listRates } from "@/server/services/fx-service";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { date, dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { UserEditor, PolicyEditor, WorkflowEditor, FxRateForm } from "./editors";

export const metadata = { title: "Administration" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const actor = await pageActor();
  const sp = await searchParams;
  const tabs = [
    can(actor, "user:manage") && { key: "users", label: "Users & roles" },
    (can(actor, "policy:manage") || can(actor, "finance:read")) && { key: "policies", label: "Expense policies" },
    (can(actor, "workflow:manage") || can(actor, "finance:read")) && { key: "workflows", label: "Approval workflows" },
    can(actor, "fx:manage") && { key: "fx", label: "Exchange rates" },
    (can(actor, "org:manage") || can(actor, "user:manage")) && { key: "org", label: "Organisation" },
    can(actor, "audit:read") && { key: "audit", label: "Audit log" },
  ].filter(Boolean) as { key: string; label: string }[];
  if (!tabs.length) return <PageHeader title="Administration" description="You do not have administrative permissions." />;
  const tab = tabs.find((t) => t.key === sp.tab)?.key ?? tabs[0].key;
  const json = (x: unknown) => JSON.parse(JSON.stringify(x));

  let body: React.ReactNode = null;
  if (tab === "users") {
    const [users, org, categories] = await Promise.all([listUsers(actor, sp.q), orgOverview(actor), prisma.expenseCategory.count()]);
    void categories;
    body = <UserEditor users={json(users)} org={json(org)} roleLabels={ROLE_LABELS} />;
  } else if (tab === "policies") {
    const [rules, cats, entities] = await Promise.all([listPolicyRules(actor), prisma.expenseCategory.findMany({ where: { groupId: actor.groupId }, orderBy: { sortOrder: "asc" } }), prisma.legalEntity.findMany({ where: { groupId: actor.groupId } })]);
    body = <PolicyEditor rules={json(rules)} categories={json(cats)} entities={json(entities)} canEdit={can(actor, "policy:manage")} />;
  } else if (tab === "workflows") {
    const [wfs, entities] = await Promise.all([listWorkflows(actor), prisma.legalEntity.findMany({ where: { groupId: actor.groupId } })]);
    body = <WorkflowEditor workflows={json(wfs)} entities={json(entities)} canEdit={can(actor, "workflow:manage")} />;
  } else if (tab === "fx") {
    const rates = await listRates({ limit: 120 });
    body = (
      <div className="space-y-4">
        <FxRateForm />
        <Card><Table><THead><TR><TH>Date</TH><TH>Pair</TH><TH className="text-right">Rate</TH><TH>Source</TH><TH>Justification</TH></TR></THead>
          <TBody>{rates.map((r) => <TR key={r.id}><TD>{date(r.effectiveDate)}</TD><TD>1 {r.baseCurrency} = ? {r.quoteCurrency}</TD><TD className="text-right tabular">{Number(r.rate).toFixed(6)}</TD><TD><Badge variant={r.source === "MANUAL" ? "warning" : "secondary"}>{r.source}</Badge></TD><TD className="max-w-80 truncate text-xs text-muted-foreground">{r.justification}</TD></TR>)}</TBody></Table></Card>
      </div>
    );
  } else if (tab === "org") {
    const org = await orgOverview(actor);
    body = (
      <div className="grid gap-4 md:grid-cols-2">{org.map((e) => (
        <Card key={e.id} className="p-5">
          <div className="flex items-start justify-between"><div><p className="font-semibold">{e.code} · {e.name}</p><p className="text-xs text-muted-foreground">{e.country.name} · functional currency {e.functionalCurrency} · {e._count.users} users · ERP {e.accountingConfig?.erpFormat ?? "—"}</p></div><Badge variant={e.active ? "success" : "secondary"}>{e.active ? "active" : "inactive"}</Badge></div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div><p className="mb-1 font-medium text-muted-foreground">Departments</p>{e.departments.map((d) => <p key={d.id}>{d.name}{d.manager && <span className="text-muted-foreground"> — {d.manager.name}</span>}</p>)}</div>
            <div><p className="mb-1 font-medium text-muted-foreground">Cost centers</p>{e.costCenters.map((c) => <p key={c.id}>{c.code}</p>)}</div>
          </div>
        </Card>))}
      </div>
    );
  } else if (tab === "audit") {
    const logs = await queryAuditLog(actor, { action: sp.q, take: 300 });
    const actors = await prisma.user.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.actorId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } });
    body = (
      <Card>
        <form className="border-b p-3"><input type="hidden" name="tab" value="audit" /><input name="q" defaultValue={sp.q} placeholder="Filter by action prefix (e.g. approval., fx., user.)" className="h-8 w-80 rounded-md border border-input bg-card px-3 text-xs" /></form>
        <Table><THead><TR><TH>When</TH><TH>Actor</TH><TH>Action</TH><TH>Object</TH><TH>Details</TH></TR></THead>
          <TBody>{logs.map((l) => (
            <TR key={l.id}><TD className="whitespace-nowrap text-xs">{dateTime(l.createdAt)}</TD><TD className="text-xs">{actors.find((a) => a.id === l.actorId)?.name ?? "system"}</TD><TD><code className="text-xs">{l.action}</code></TD><TD className="text-xs">{l.entityType} <span className="font-mono text-muted-foreground">{l.entityId.slice(-8)}</span></TD>
              <TD className="max-w-md"><code className="line-clamp-2 break-all text-[11px] text-muted-foreground">{l.data ? JSON.stringify(l.data) : ""}</code></TD></TR>))}
          </TBody></Table>
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">The audit log is append-only: updates and deletions are blocked at database level.</p>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader title="Administration" description="Configuration changes are versioned in the audit trail." />
      <nav className="mb-5 flex flex-wrap gap-1 border-b" aria-label="Administration sections">
        {tabs.map((t) => <Link key={t.key} href={`?tab=${t.key}`} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === t.key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>{t.label}</Link>)}
      </nav>
      {body}
    </div>
  );
}
