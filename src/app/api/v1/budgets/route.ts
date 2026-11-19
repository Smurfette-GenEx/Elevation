import { api, parseJson } from "@/server/http/handler";
import { budgetSchema } from "@/server/validation";
import { listBudgets, upsertBudget } from "@/server/services/budget-service";

export const GET = api(async ({ req, actor }) => {
  const sp = req.nextUrl.searchParams;
  const rows = await listBudgets(actor, { fiscalYear: Number(sp.get("year") ?? new Date().getUTCFullYear()), legalEntityId: sp.get("legalEntityId") ?? undefined });
  return rows.map((r) => ({ ...r.budget, legalEntity: { code: r.budget.legalEntity.code }, indicators: r.indicators }));
});
export const POST = api(async ({ req, actor }) => upsertBudget(actor, await parseJson(req, budgetSchema)));
