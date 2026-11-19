import { api, parseJson } from "@/server/http/handler";
import { expenseLineSchema } from "@/server/validation";
import { deleteExpenseLine, saveExpenseLine } from "@/server/services/report-service";

export const PUT = api(async ({ req, actor, params }) => saveExpenseLine(actor, params.id, params.lineId, await parseJson(req, expenseLineSchema)));
export const DELETE = api(async ({ actor, params }) => deleteExpenseLine(actor, params.id, params.lineId));
