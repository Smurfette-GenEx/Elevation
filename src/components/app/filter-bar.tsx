"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { Input, Select } from "@/components/ui/form";
import { buttonVariants } from "@/components/ui/button";

type Opt = { value: string; label: string };

/** All dashboard filters in one row; state lives in the URL so views are shareable and server-rendered. */
export function FilterBar({ options, view, exportable = true }: { options: { countries: Opt[]; entities: Opt[]; departments: Opt[]; costCenters: Opt[]; categories: Opt[]; currencies: Opt[] }; view: string; exportable?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v); else next.delete(k);
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };
  const now = new Date();
  const from = sp.get("from") ?? `${now.getUTCFullYear()}-01-01`;
  const to = sp.get("to") ?? now.toISOString().slice(0, 10);
  const sel = (key: string, label: string, opts: Opt[]) => (
    <Select aria-label={label} value={sp.get(key) ?? ""} onChange={(e) => set(key, e.target.value)} className="h-8 w-auto min-w-32 text-xs">
      <option value="">All {label.toLowerCase()}</option>
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </Select>
  );
  const qs = new URLSearchParams(sp.toString());
  qs.set("view", view);
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5 shadow-sm">
      <Input type="date" aria-label="From" value={from} onChange={(e) => set("from", e.target.value)} className="h-8 w-36 text-xs" />
      <span className="text-xs text-muted-foreground">to</span>
      <Input type="date" aria-label="To" value={to} onChange={(e) => set("to", e.target.value)} className="h-8 w-36 text-xs" />
      {options.countries.length > 1 && sel("country", "Countries", options.countries)}
      {options.entities.length > 1 && sel("entity", "Entities", options.entities)}
      {sel("department", "Departments", options.departments)}
      {sel("costCenter", "Cost centers", options.costCenters)}
      {sel("category", "Categories", options.categories)}
      {sel("currency", "Currencies", options.currencies)}
      {exportable && (
        <div className="ml-auto flex gap-1.5">
          <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/v1/dashboard/export?${qs}&format=xlsx`}><Download />Excel</a>
          <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/v1/dashboard/export?${qs}&format=pdf`}><FileText />PDF</a>
        </div>
      )}
    </div>
  );
}
