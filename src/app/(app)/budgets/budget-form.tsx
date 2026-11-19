"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { apiFetch, errorMessage } from "@/lib/client-api";

type O = { entities: { id: string; code: string }[]; departments: { id: string; name: string; legalEntityId: string }[]; costCenters: { id: string; code: string; legalEntityId: string }[]; categories: { id: string; name: string }[] };

export function BudgetForm({ year, options }: { year: number; options: O }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [entity, setEntity] = useState(options.entities[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      await apiFetch("/api/v1/budgets", { method: "POST", json: {
        legalEntityId: entity, code: f.code, name: f.name, fiscalYear: year, month: f.month ? Number(f.month) : null,
        departmentId: f.departmentId || null, costCenterId: f.costCenterId || null, categoryId: f.categoryId || null,
        initialAmount: f.initialAmount, revisedAmount: f.revisedAmount || null,
      } });
      setOpen(false);
      router.refresh();
    } catch (err) { setError(errorMessage(err)); }
  }
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Create / revise budget</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Budget FY${year}`} description="Using an existing code for the entity updates (revises) that budget. Changes are audited.">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          {error && <Alert tone="error" className="sm:col-span-2">{error}</Alert>}
          <Field label="Entity"><Select value={entity} onChange={(e) => setEntity(e.target.value)}>{options.entities.map((e) => <option key={e.id} value={e.id}>{e.code}</option>)}</Select></Field>
          <Field label="Code"><Input name="code" required /></Field>
          <Field label="Name" className="sm:col-span-2"><Input name="name" required /></Field>
          <Field label="Department"><Select name="departmentId"><option value="">All</option>{options.departments.filter((d) => d.legalEntityId === entity).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Cost center"><Select name="costCenterId"><option value="">All</option>{options.costCenters.filter((c) => c.legalEntityId === entity).map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</Select></Field>
          <Field label="Category"><Select name="categoryId"><option value="">All</option>{options.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Month (blank = annual)"><Input name="month" type="number" min={1} max={12} /></Field>
          <Field label="Initial amount"><Input name="initialAmount" inputMode="decimal" required /></Field>
          <Field label="Revised amount"><Input name="revisedAmount" inputMode="decimal" /></Field>
          <div className="flex justify-end sm:col-span-2"><Button type="submit">Save budget</Button></div>
        </form>
      </Dialog>
    </>
  );
}
