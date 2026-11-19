"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { compactMoney, money } from "@/lib/format";

const axis = { fontSize: 11, fill: "var(--muted-foreground)" };

function ViewToggle({ table, setTable }: { table: boolean; setTable: (v: boolean) => void }) {
  return (
    <div className="flex rounded-md border p-0.5 text-[11px]" role="group" aria-label="Chart view">
      {["Chart", "Table"].map((l) => (
        <button key={l} onClick={() => setTable(l === "Table")} aria-pressed={(l === "Table") === table}
          className={`rounded px-2 py-0.5 ${(l === "Table") === table ? "bg-muted font-medium" : "text-muted-foreground"}`}>{l}</button>
      ))}
    </div>
  );
}

function TipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 tabular">
          {r.color && <span className="size-2 rounded-sm" style={{ background: r.color }} />}
          <span className="text-muted-foreground">{r.label}</span><span className="ml-auto font-medium">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Single-series horizontal bars (magnitude by dimension). The card title names the series, so no legend. */
export function BreakdownBars({ title, data, currency, max = 8 }: { title: string; data: { label: string; amount: number; count: number }[]; currency: string; max?: number }) {
  const [table, setTable] = useState(false);
  const rows = data.length > max ? [...data.slice(0, max - 1), { label: `Other (${data.length - max + 1})`, amount: data.slice(max - 1).reduce((a, b) => a + b.amount, 0), count: data.slice(max - 1).reduce((a, b) => a + b.count, 0) }] : data;
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{title}</h3><ViewToggle table={table} setTable={setTable} /></div>
      {rows.length === 0 ? <p className="py-8 text-center text-xs text-muted-foreground">No data for these filters</p> : table ? (
        <Table><THead><TR><TH>{title.replace(/^.*by /i, "")}</TH><TH className="text-right">Amount</TH><TH className="text-right">Lines</TH></TR></THead>
          <TBody>{rows.map((r) => <TR key={r.label}><TD>{r.label}</TD><TD className="text-right tabular">{money(r.amount, currency)}</TD><TD className="text-right tabular">{r.count}</TD></TR>)}</TBody></Table>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 34 + 10)}>
          <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 64, top: 0, bottom: 0 }} barCategoryGap={6}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" width={150} tick={axis} tickLine={false} axisLine={false} tickFormatter={(v: string) => (v.length > 24 ? `${v.slice(0, 23)}…` : v)} />
            <Tooltip cursor={{ fill: "var(--muted)" }} content={({ active, payload }) => active && payload?.[0] ? <TipBox title={String(payload[0].payload.label)} rows={[{ label: "Amount", value: money(Number(payload[0].value), currency) }, { label: "Lines", value: String(payload[0].payload.count) }]} /> : null} />
            <Bar dataKey="amount" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={22}>
              <LabelList dataKey="amount" position="right" formatter={(v: unknown) => compactMoney(Number(v), currency)} style={{ fontSize: 11, fill: "var(--foreground)" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

const TREND_SERIES = [
  { key: "paid", label: "Paid", color: "var(--chart-1)" },
  { key: "approved", label: "Approved", color: "var(--chart-3)" },
  { key: "pending", label: "Pending", color: "var(--chart-2)" },
] as const;

/** Monthly expenses stacked by lifecycle bucket (each expense counted once). */
export function TrendChart({ data, currency }: { data: { month: string; pending: number; approved: number; paid: number }[]; currency: string }) {
  const [table, setTable] = useState(false);
  const label = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Monthly expenses by status</h3><ViewToggle table={table} setTable={setTable} /></div>
      {data.length === 0 ? <p className="py-8 text-center text-xs text-muted-foreground">No data for these filters</p> : table ? (
        <Table><THead><TR><TH>Month</TH>{TREND_SERIES.map((s) => <TH key={s.key} className="text-right">{s.label}</TH>)}<TH className="text-right">Total</TH></TR></THead>
          <TBody>{data.map((r) => <TR key={r.month}><TD>{r.month}</TD>{TREND_SERIES.map((s) => <TD key={s.key} className="text-right tabular">{money(r[s.key], currency)}</TD>)}<TD className="text-right tabular font-medium">{money(r.paid + r.approved + r.pending, currency)}</TD></TR>)}</TBody></Table>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis dataKey="month" tickFormatter={label} tick={axis} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
            <YAxis tickFormatter={(v: number) => compactMoney(v, currency)} tick={axis} tickLine={false} axisLine={false} width={60} />
            <Tooltip cursor={{ fill: "var(--muted)" }} content={({ active, payload, label: l }) => active && payload?.length ? (
              <TipBox title={String(l)} rows={[...TREND_SERIES].reverse().map((s) => ({ label: s.label, value: money(Number(payload.find((p) => p.dataKey === s.key)?.value ?? 0), currency), color: s.color }))} />) : null} />
            <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
            {TREND_SERIES.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} stroke="var(--card)" strokeWidth={2} radius={i === TREND_SERIES.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
