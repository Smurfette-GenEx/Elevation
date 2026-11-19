import { pageActor } from "@/server/auth/page";
import { can, entityIdsFor } from "@/server/auth/scope";
import { listBudgets } from "@/server/services/budget-service";
import { orgFilterOptions } from "@/server/services/reference-service";
import { PageHeader, Progress, EmptyState } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { money, pct } from "@/lib/format";
import { BudgetForm } from "./budget-form";
import Link from "next/link";

export const metadata = { title: "Budgets" };

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ year?: string; entity?: string }> }) {
  const actor = await pageActor("budget:read");
  const sp = await searchParams;
  const year = Number(sp.year ?? new Date().getUTCFullYear());
  const rows = await listBudgets(actor, { fiscalYear: year, legalEntityId: sp.entity });
  const manage = can(actor, "budget:manage");
  const options = manage ? await orgFilterOptions(actor, await entityIdsFor(actor, "budget:manage")) : null;
  return (
    <div>
      <PageHeader title={`Budgets — FY${year}`} description="Each expense counts once: pending (in approval), approved (awaiting payment) or paid. Alerts fire at 80%, 90% and 100%."
        actions={<>{[year - 1, year, year + 1].map((y) => <Link key={y} href={`?year=${y}`} className={`rounded-full border px-3 py-1 text-xs ${y === year ? "border-primary bg-accent" : "text-muted-foreground"}`}>FY{y}</Link>)}{options && <BudgetForm year={year} options={JSON.parse(JSON.stringify(options))} />}</>} />
      {rows.length === 0 ? <EmptyState title="No budgets for this year in your scope" /> : (
        <Card>
          <Table>
            <THead><TR><TH>Budget</TH><TH>Scope</TH><TH className="text-right">Budget</TH><TH className="text-right">Pending</TH><TH className="text-right">Approved</TH><TH className="text-right">Paid</TH><TH className="text-right">Remaining</TH><TH className="text-right">Forecast</TH><TH className="text-right">Variance</TH><TH className="w-44">Consumption</TH></TR></THead>
            <TBody>{rows.map(({ budget: b, indicators: i }) => (
              <TR key={b.id}>
                <TD><p className="font-medium">{b.code}</p><p className="text-xs text-muted-foreground">{b.name}</p></TD>
                <TD className="text-xs">{b.legalEntity.code}{b.department && ` · ${b.department.name}`}{b.costCenter && ` · ${b.costCenter.code}`}{b.project && ` · ${b.project.code}`}{b.category && ` · ${b.category.name}`}{b.month && ` · M${b.month}`}</TD>
                <TD className="text-right tabular">{money(i.current.toString(), b.currency)}{b.revisedAmount && <p className="text-[11px] text-muted-foreground">initial {money(i.initial.toString(), b.currency)}</p>}</TD>
                <TD className="text-right tabular">{money(i.pending.toString(), b.currency)}</TD>
                <TD className="text-right tabular">{money(i.approved.toString(), b.currency)}</TD>
                <TD className="text-right tabular">{money(i.paid.toString(), b.currency)}</TD>
                <TD className={`text-right tabular ${i.remaining.isNegative() ? "text-destructive" : ""}`}>{money(i.remaining.toString(), b.currency)}</TD>
                <TD className="text-right tabular">{money(i.forecastAtCompletion.toString(), b.currency)}</TD>
                <TD className={`text-right tabular ${i.variance.isNegative() ? "text-destructive" : "text-success"}`}>{pct(i.variancePct)}</TD>
                <TD><div className="flex items-center gap-2"><Progress value={i.consumptionPct} tone={i.alertLevel >= 100 ? "destructive" : i.alertLevel >= 80 ? "warning" : "default"} /><span className="w-11 text-right text-xs tabular">{pct(i.consumptionPct)}</span></div>{i.alertLevel > 0 && <Badge className="mt-1" variant={i.alertLevel >= 100 ? "destructive" : "warning"}>{i.alertLevel >= 100 ? "Overrun" : `Above ${i.alertLevel}%`}</Badge>}</TD>
              </TR>))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
