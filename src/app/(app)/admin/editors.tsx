"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionBadge, SeverityBadge } from "@/components/app/status";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { dateTime } from "@/lib/format";

const ROLES = ["EMPLOYEE", "LINE_MANAGER", "DEPARTMENT_MANAGER", "FINANCE_CONTROLLER", "LOCAL_FINANCE", "GROUP_FINANCE", "CFO", "SYSTEM_ADMIN"] as const;
const SCOPES = ["GROUP", "COUNTRY", "LEGAL_ENTITY", "DEPARTMENT", "COST_CENTER"] as const;

type Org = { id: string; code: string; name: string; countryCode: string; departments: { id: string; name: string }[]; costCenters: { id: string; code: string }[] }[];
type User = { id: string; email: string; name: string; active: boolean; legalEntityId: string; departmentId: string | null; costCenterId: string | null; managerId: string | null; countryCode: string; employeeNumber: string | null; lastLoginAt: string | null; legalEntity: { code: string }; manager: { name: string } | null; roles: { role: string; scopeType: string; scopeId: string | null }[] };

function useAct() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setError(null);
    try { await fn(); after?.(); router.refresh(); } catch (e) { setError(errorMessage(e)); }
  };
  return { error, act };
}

export function UserEditor({ users, org, roleLabels }: { users: User[]; org: Org; roleLabels: Record<string, string> }) {
  const [edit, setEdit] = useState<User | "new" | null>(null);
  const scopeLabel = (r: User["roles"][number]) => {
    if (r.scopeType === "GROUP") return "group";
    if (r.scopeType === "LEGAL_ENTITY") return org.find((e) => e.id === r.scopeId)?.code ?? "?";
    if (r.scopeType === "DEPARTMENT") return org.flatMap((e) => e.departments.map((d) => ({ ...d, e: e.code }))).find((d) => d.id === r.scopeId)?.name ?? "dept";
    return `${r.scopeType.toLowerCase()} ${r.scopeId ?? ""}`;
  };
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <form><input type="hidden" name="tab" value="users" /><Input name="q" placeholder="Search users…" className="h-8 w-64 text-xs" /></form>
        <Button size="sm" onClick={() => setEdit("new")}><Plus />New user</Button>
      </div>
      <Card>
        <Table>
          <THead><TR><TH>Name</TH><TH>Entity</TH><TH>Manager</TH><TH>Roles (scope)</TH><TH>Last login</TH><TH>Status</TH><TH /></TR></THead>
          <TBody>{users.map((u) => (
            <TR key={u.id}>
              <TD><p className="font-medium">{u.name}</p><p className="text-xs text-muted-foreground">{u.email}</p></TD>
              <TD>{u.legalEntity.code}</TD><TD className="text-xs">{u.manager?.name ?? "—"}</TD>
              <TD><div className="flex max-w-md flex-wrap gap-1">{u.roles.map((r) => <Badge key={r.role + r.scopeId} variant="secondary">{roleLabels[r.role]} · {scopeLabel(r)}</Badge>)}</div></TD>
              <TD className="text-xs text-muted-foreground">{dateTime(u.lastLoginAt)}</TD>
              <TD><Badge variant={u.active ? "success" : "secondary"}>{u.active ? "active" : "disabled"}</Badge></TD>
              <TD><Button size="sm" variant="ghost" onClick={() => setEdit(u)}>Edit</Button></TD>
            </TR>))}
          </TBody>
        </Table>
      </Card>
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "New user" : "Edit user"} description="Role changes take effect immediately; deactivation revokes all sessions." className="w-[min(780px,calc(100vw-2rem))]">
        {edit && <UserForm user={edit === "new" ? null : edit} users={users} org={org} roleLabels={roleLabels} onDone={() => setEdit(null)} />}
      </Dialog>
    </>
  );
}

function UserForm({ user, users, org, roleLabels, onDone }: { user: User | null; users: User[]; org: Org; roleLabels: Record<string, string>; onDone: () => void }) {
  const { error, act } = useAct();
  const [v, setV] = useState({
    email: user?.email ?? "", name: user?.name ?? "", legalEntityId: user?.legalEntityId ?? org[0]?.id ?? "", departmentId: user?.departmentId ?? "", costCenterId: user?.costCenterId ?? "",
    managerId: user?.managerId ?? "", countryCode: user?.countryCode ?? org[0]?.countryCode ?? "", employeeNumber: user?.employeeNumber ?? "", active: user?.active ?? true, password: "",
  });
  const [roles, setRoles] = useState(user?.roles ?? [{ role: "EMPLOYEE", scopeType: "LEGAL_ENTITY", scopeId: org[0]?.id ?? null }]);
  const ent = org.find((e) => e.id === v.legalEntityId);
  const scopeOptions = (t: string) => t === "LEGAL_ENTITY" ? org.map((e) => ({ v: e.id, l: e.code })) : t === "COUNTRY" ? [...new Set(org.map((e) => e.countryCode))].map((c) => ({ v: c, l: c })) : t === "DEPARTMENT" ? org.flatMap((e) => e.departments.map((d) => ({ v: d.id, l: `${e.code} ${d.name}` }))) : t === "COST_CENTER" ? org.flatMap((e) => e.costCenters.map((c) => ({ v: c.id, l: c.code }))) : [];
  const save = () => act(() => apiFetch(user ? `/api/v1/admin/users/${user.id}` : "/api/v1/admin/users", {
    method: user ? "PUT" : "POST",
    json: { ...v, departmentId: v.departmentId || null, costCenterId: v.costCenterId || null, managerId: v.managerId || null, employeeNumber: v.employeeNumber || null, password: v.password || undefined, roles },
  }), onDone);
  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Email"><Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
        <Field label="Legal entity"><Select value={v.legalEntityId} onChange={(e) => { const en = org.find((x) => x.id === e.target.value); setV({ ...v, legalEntityId: e.target.value, countryCode: en?.countryCode ?? v.countryCode, departmentId: "", costCenterId: "" }); }}>{org.map((e) => <option key={e.id} value={e.id}>{e.code} — {e.name}</option>)}</Select></Field>
        <Field label="Line manager"><Select value={v.managerId} onChange={(e) => setV({ ...v, managerId: e.target.value })}><option value="">None</option>{users.filter((u) => u.id !== user?.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <Field label="Department"><Select value={v.departmentId} onChange={(e) => setV({ ...v, departmentId: e.target.value })}><option value="">—</option>{ent?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Cost center"><Select value={v.costCenterId} onChange={(e) => setV({ ...v, costCenterId: e.target.value })}><option value="">—</option>{ent?.costCenters.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</Select></Field>
        <Field label="Employee number"><Input value={v.employeeNumber} onChange={(e) => setV({ ...v, employeeNumber: e.target.value })} /></Field>
        <Field label={user ? "New password (leave blank to keep)" : "Initial password"} hint="Min. 12 chars, upper/lower case and digits"><Input type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} /></Field>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Roles and organisational scope</p>
        <div className="space-y-2">{roles.map((r, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <Select value={r.role} onChange={(e) => { const n = [...roles]; n[i] = { ...r, role: e.target.value }; setRoles(n); }} className="w-52">{ROLES.map((x) => <option key={x} value={x}>{roleLabels[x]}</option>)}</Select>
            <Select value={r.scopeType} onChange={(e) => { const n = [...roles]; n[i] = { ...r, scopeType: e.target.value, scopeId: null }; setRoles(n); }} className="w-40">{SCOPES.map((x) => <option key={x} value={x}>{x.replace("_", " ").toLowerCase()}</option>)}</Select>
            {r.scopeType !== "GROUP" && <Select value={r.scopeId ?? ""} onChange={(e) => { const n = [...roles]; n[i] = { ...r, scopeId: e.target.value }; setRoles(n); }} className="w-48"><option value="">Select…</option>{scopeOptions(r.scopeType).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</Select>}
            <Button size="icon" variant="ghost" onClick={() => setRoles(roles.filter((_, j) => j !== i))} aria-label="Remove role"><Trash2 /></Button>
          </div>))}
        </div>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => setRoles([...roles, { role: "EMPLOYEE", scopeType: "LEGAL_ENTITY", scopeId: v.legalEntityId }])}><Plus />Add role</Button>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />Active</label>
      <div className="flex justify-between">
        {user ? <Button variant="ghost" className="text-destructive" onClick={() => confirm("Pseudonymise this user's personal data? Financial records are kept for legal retention. This cannot be undone.") && act(() => apiFetch(`/api/v1/admin/users/${user.id}/anonymize`, { method: "POST" }), onDone)}>GDPR erase</Button> : <span />}
        <Button onClick={save}>Save user</Button>
      </div>
    </div>
  );
}

type Rule = { id: string; name: string; type: string; countryCode: string | null; legalEntityId: string | null; categoryId: string | null; params: Record<string, string | number>; currency: string | null; action: string; severity: string; priority: number; active: boolean; category: { name: string } | null };
const RULE_TYPES = ["CATEGORY_MAX_PER_ITEM", "DAILY_MEAL_ALLOWANCE", "ACCOMMODATION_NIGHTLY_MAX", "RECEIPT_REQUIRED_ABOVE", "WEEKEND_EXPENSE", "PUBLIC_HOLIDAY_EXPENSE", "DUPLICATE_EXPENSE", "DUPLICATE_RECEIPT", "CATEGORY_NOT_ALLOWED", "UNUSUAL_AMOUNT", "BUDGET_OVERRUN", "LATE_SUBMISSION", "MISSING_DESCRIPTION"];
const PARAM_HINT: Record<string, string> = { CATEGORY_MAX_PER_ITEM: "maxAmount", DAILY_MEAL_ALLOWANCE: "maxAmount", ACCOMMODATION_NIGHTLY_MAX: "maxAmount", RECEIPT_REQUIRED_ABOVE: "threshold", UNUSUAL_AMOUNT: "multiplier", LATE_SUBMISSION: "maxDaysAfter", MISSING_DESCRIPTION: "minLength" };

export function PolicyEditor({ rules, categories, entities, canEdit }: { rules: Rule[]; categories: { id: string; name: string }[]; entities: { id: string; code: string }[]; canEdit: boolean }) {
  const [edit, setEdit] = useState<Rule | "new" | null>(null);
  const fmtParams = (r: Rule) => Object.entries(r.params ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ");
  return (
    <>
      {canEdit && <div className="mb-3 flex justify-end"><Button size="sm" onClick={() => setEdit("new")}><Plus />New rule</Button></div>}
      <Card>
        <Table>
          <THead><TR><TH>Rule</TH><TH>Scope</TH><TH>Parameters</TH><TH>Control</TH><TH>Severity</TH><TH>Status</TH><TH /></TR></THead>
          <TBody>{rules.map((r) => (
            <TR key={r.id}>
              <TD><p className="font-medium">{r.name}</p><p className="text-[11px] text-muted-foreground">{r.type.replaceAll("_", " ").toLowerCase()}</p></TD>
              <TD className="text-xs">{[r.legalEntityId ? entities.find((e) => e.id === r.legalEntityId)?.code : null, r.countryCode, r.category?.name].filter(Boolean).join(" · ") || "Group-wide"}</TD>
              <TD className="text-xs">{fmtParams(r) || "—"}{r.currency && fmtParams(r) ? ` ${r.currency}` : ""}</TD>
              <TD><ActionBadge action={r.action} /></TD><TD><SeverityBadge severity={r.severity} /></TD>
              <TD><Badge variant={r.active ? "success" : "secondary"}>{r.active ? "active" : "off"}</Badge></TD>
              <TD>{canEdit && <Button size="sm" variant="ghost" onClick={() => setEdit(r)}>Edit</Button>}</TD>
            </TR>))}
          </TBody>
        </Table>
      </Card>
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "New policy rule" : "Edit policy rule"} description="The most specific active rule (entity > country > category) applies.">
        {edit && <RuleForm rule={edit === "new" ? null : edit} categories={categories} entities={entities} onDone={() => setEdit(null)} />}
      </Dialog>
    </>
  );
}

function RuleForm({ rule, categories, entities, onDone }: { rule: Rule | null; categories: { id: string; name: string }[]; entities: { id: string; code: string }[]; onDone: () => void }) {
  const { error, act } = useAct();
  const [v, setV] = useState({ name: rule?.name ?? "", type: rule?.type ?? "CATEGORY_MAX_PER_ITEM", legalEntityId: rule?.legalEntityId ?? "", countryCode: rule?.countryCode ?? "", categoryId: rule?.categoryId ?? "", currency: rule?.currency ?? "EUR", action: rule?.action ?? "WARN", severity: rule?.severity ?? "MEDIUM", priority: rule?.priority ?? 0, active: rule?.active ?? true, params: JSON.stringify(rule?.params ?? (PARAM_HINT["CATEGORY_MAX_PER_ITEM"] ? { maxAmount: 100 } : {})) });
  const save = () => {
    let params: unknown;
    try { params = JSON.parse(v.params || "{}"); } catch { return act(async () => { throw new Error("Parameters must be valid JSON"); }); }
    return act(() => apiFetch(rule ? `/api/v1/admin/policies/${rule.id}` : "/api/v1/admin/policies", { method: rule ? "PUT" : "POST", json: { ...v, params, legalEntityId: v.legalEntityId || null, countryCode: v.countryCode || null, categoryId: v.categoryId || null, currency: v.currency || null } }), onDone);
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {error && <Alert tone="error" className="sm:col-span-2">{error}</Alert>}
      <Field label="Name" className="sm:col-span-2"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field label="Type"><Select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value, params: PARAM_HINT[e.target.value] ? JSON.stringify({ [PARAM_HINT[e.target.value]]: 0 }) : "{}" })}>{RULE_TYPES.map((t) => <option key={t} value={t}>{t.replaceAll("_", " ").toLowerCase()}</option>)}</Select></Field>
      <Field label="Parameters (JSON)" hint={PARAM_HINT[v.type] ? `Expected key: ${PARAM_HINT[v.type]}` : "No parameters needed"}><Input value={v.params} onChange={(e) => setV({ ...v, params: e.target.value })} className="font-mono text-xs" /></Field>
      <Field label="Legal entity"><Select value={v.legalEntityId} onChange={(e) => setV({ ...v, legalEntityId: e.target.value })}><option value="">All</option>{entities.map((e) => <option key={e.id} value={e.id}>{e.code}</option>)}</Select></Field>
      <Field label="Category"><Select value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })}><option value="">All</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      <Field label="Country (ISO)"><Input value={v.countryCode} maxLength={2} onChange={(e) => setV({ ...v, countryCode: e.target.value.toUpperCase() })} /></Field>
      <Field label="Currency of amounts"><Input value={v.currency} maxLength={3} onChange={(e) => setV({ ...v, currency: e.target.value.toUpperCase() })} /></Field>
      <Field label="Control type"><Select value={v.action} onChange={(e) => setV({ ...v, action: e.target.value })}><option value="BLOCK">Blocking</option><option value="REQUIRE_EXCEPTION">Exception requiring approval</option><option value="WARN">Warning</option></Select></Field>
      <Field label="Severity"><Select value={v.severity} onChange={(e) => setV({ ...v, severity: e.target.value })}>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s}>{s}</option>)}</Select></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />Active</label>
      <div className="flex justify-end"><Button onClick={save}>Save rule</Button></div>
    </div>
  );
}

type Step = { sequence: number; name: string; approverType: string; role: string | null; userId: string | null; minAmount: string; maxAmount: string | null; requiredOnException: boolean; categoryCodes: string[]; slaHours: number; escalateToRole: string | null };
type Wf = { id: string; name: string; description: string | null; countryCode: string | null; legalEntityId: string | null; departmentId: string | null; categoryCode: string | null; projectId: string | null; costCenterId: string | null; priority: number; thresholdCurrency: string; active: boolean; steps: Step[] };

export function WorkflowEditor({ workflows, entities, canEdit }: { workflows: Wf[]; entities: { id: string; code: string }[]; canEdit: boolean }) {
  const [edit, setEdit] = useState<Wf | null>(null);
  return (
    <div className="space-y-4">
      <Alert tone="info">The most specific matching workflow (by priority, then entity / department / cost center / project / category / country) routes each report. Steps apply when the report total in the workflow currency is within the step band; “on exception” steps are added whenever a policy exception is pending. The claimant is never an approver.</Alert>
      {workflows.map((w) => (
        <Card key={w.id}>
          <CardHeader className="flex-row items-start justify-between">
            <div><CardTitle>{w.name}</CardTitle><CardDescription>{[w.legalEntityId && `Entity ${entities.find((e) => e.id === w.legalEntityId)?.code}`, w.countryCode && `Country ${w.countryCode}`, w.categoryCode && `Category ${w.categoryCode}`].filter(Boolean).join(" · ") || "Applies group-wide"} · thresholds in {w.thresholdCurrency} · priority {w.priority}</CardDescription></div>
            <div className="flex items-center gap-2"><Badge variant={w.active ? "success" : "secondary"}>{w.active ? "active" : "inactive"}</Badge>{canEdit && <Button size="sm" variant="ghost" onClick={() => setEdit(w)}>Edit</Button>}</div>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-wrap items-stretch gap-2">{w.steps.map((s, i) => (
              <li key={s.sequence} className="flex items-center gap-2">
                <div className="rounded-md border px-3 py-2 text-xs">
                  <p className="font-medium">{s.sequence}. {s.name}</p>
                  <p className="text-muted-foreground">{s.approverType === "ROLE" ? s.role?.replaceAll("_", " ").toLowerCase() : s.approverType.replaceAll("_", " ").toLowerCase()}</p>
                  <p className="text-muted-foreground">{Number(s.minAmount) > 0 ? `≥ ${Number(s.minAmount).toLocaleString()} ${w.thresholdCurrency}` : "always"}{s.maxAmount ? ` & < ${Number(s.maxAmount).toLocaleString()}` : ""}{s.requiredOnException ? " · on exception" : ""} · SLA {s.slaHours}h</p>
                </div>
                {i < w.steps.length - 1 && <span className="text-muted-foreground">→</span>}
              </li>))}
            </ol>
          </CardContent>
        </Card>
      ))}
      <Dialog open={!!edit} onClose={() => setEdit(null)} title="Edit approval workflow" className="w-[min(900px,calc(100vw-2rem))]">
        {edit && <WorkflowForm wf={edit} onDone={() => setEdit(null)} />}
      </Dialog>
    </div>
  );
}

function WorkflowForm({ wf, onDone }: { wf: Wf; onDone: () => void }) {
  const { error, act } = useAct();
  const [w, setW] = useState(wf);
  const [steps, setSteps] = useState(wf.steps.map((s) => ({ ...s, minAmount: String(Number(s.minAmount)), maxAmount: s.maxAmount ? String(Number(s.maxAmount)) : "" })));
  const upd = (i: number, patch: Partial<(typeof steps)[number]>) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const save = () => act(() => apiFetch(`/api/v1/admin/workflows/${wf.id}`, { method: "PUT", json: {
    name: w.name, description: w.description, countryCode: w.countryCode, legalEntityId: w.legalEntityId, departmentId: w.departmentId, categoryCode: w.categoryCode,
    projectId: w.projectId, costCenterId: w.costCenterId, priority: Number(w.priority), thresholdCurrency: w.thresholdCurrency, active: w.active,
    steps: steps.map((s) => ({ ...s, maxAmount: s.maxAmount || null, slaHours: Number(s.slaHours) })),
  } }), onDone);
  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Name" className="sm:col-span-2"><Input value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} /></Field>
        <Field label="Threshold currency"><Input value={w.thresholdCurrency} maxLength={3} onChange={(e) => setW({ ...w, thresholdCurrency: e.target.value.toUpperCase() })} /></Field>
        <Field label="Priority"><Input type="number" value={w.priority} onChange={(e) => setW({ ...w, priority: Number(e.target.value) })} /></Field>
      </div>
      <Table>
        <THead><TR><TH>#</TH><TH>Name</TH><TH>Approver</TH><TH>Min</TH><TH>Max</TH><TH>On exception</TH><TH>SLA h</TH><TH /></TR></THead>
        <TBody>{steps.map((s, i) => (
          <TR key={i}>
            <TD><Input type="number" className="h-8 w-14" value={s.sequence} onChange={(e) => upd(i, { sequence: Number(e.target.value) })} /></TD>
            <TD><Input className="h-8" value={s.name} onChange={(e) => upd(i, { name: e.target.value })} /></TD>
            <TD><Select className="h-8" value={s.approverType === "ROLE" ? `ROLE:${s.role}` : s.approverType} onChange={(e) => { const [t, r] = e.target.value.split(":"); upd(i, { approverType: t, role: r ?? null }); }}>
              <option value="LINE_MANAGER">Line manager</option><option value="DEPARTMENT_MANAGER">Department manager</option>
              {ROLES.filter((r) => r !== "EMPLOYEE").map((r) => <option key={r} value={`ROLE:${r}`}>Role: {r.replaceAll("_", " ").toLowerCase()}</option>)}
            </Select></TD>
            <TD><Input className="h-8 w-24" value={s.minAmount} onChange={(e) => upd(i, { minAmount: e.target.value })} /></TD>
            <TD><Input className="h-8 w-24" value={s.maxAmount} onChange={(e) => upd(i, { maxAmount: e.target.value })} /></TD>
            <TD className="text-center"><input type="checkbox" checked={s.requiredOnException} onChange={(e) => upd(i, { requiredOnException: e.target.checked })} /></TD>
            <TD><Input type="number" className="h-8 w-20" value={s.slaHours} onChange={(e) => upd(i, { slaHours: Number(e.target.value) })} /></TD>
            <TD><Button size="icon" variant="ghost" onClick={() => setSteps(steps.filter((_, j) => j !== i))} aria-label="Remove step"><Trash2 /></Button></TD>
          </TR>))}</TBody>
      </Table>
      <div className="flex justify-between">
        <Button size="sm" variant="outline" onClick={() => setSteps([...steps, { sequence: steps.length + 1, name: "New step", approverType: "ROLE", role: "FINANCE_CONTROLLER", userId: null, minAmount: "0", maxAmount: "", requiredOnException: false, categoryCodes: [], slaHours: 72, escalateToRole: null }])}><Plus />Add step</Button>
        <div className="flex items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={w.active} onChange={(e) => setW({ ...w, active: e.target.checked })} />Active</label><Button onClick={save}>Save workflow</Button></div>
      </div>
    </div>
  );
}

export function FxRateForm() {
  const { error, act } = useAct();
  const [v, setV] = useState({ baseCurrency: "EUR", quoteCurrency: "USD", rate: "", effectiveDate: new Date().toISOString().slice(0, 10), justification: "" });
  return (
    <Card>
      <CardHeader><CardTitle>Add a manual / corporate rate</CardTitle><CardDescription>Daily ECB reference rates are imported automatically. Manual rates take precedence for the same date and are audited. Historical conversions are never changed.</CardDescription></CardHeader>
      <CardContent>
        {error && <Alert tone="error" className="mb-3">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-6">
          <Field label="Base"><Input value={v.baseCurrency} maxLength={3} onChange={(e) => setV({ ...v, baseCurrency: e.target.value.toUpperCase() })} /></Field>
          <Field label="Quote"><Input value={v.quoteCurrency} maxLength={3} onChange={(e) => setV({ ...v, quoteCurrency: e.target.value.toUpperCase() })} /></Field>
          <Field label="Rate"><Input value={v.rate} inputMode="decimal" onChange={(e) => setV({ ...v, rate: e.target.value })} /></Field>
          <Field label="Effective date"><Input type="date" value={v.effectiveDate} onChange={(e) => setV({ ...v, effectiveDate: e.target.value })} /></Field>
          <Field label="Justification" className="sm:col-span-2"><Input value={v.justification} onChange={(e) => setV({ ...v, justification: e.target.value })} /></Field>
        </div>
        <div className="mt-3 flex justify-end"><Button onClick={() => act(() => apiFetch("/api/v1/fx/rates", { method: "POST", json: v }))}>Save rate</Button></div>
      </CardContent>
    </Card>
  );
}
