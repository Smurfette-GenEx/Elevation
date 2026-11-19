import { api, parseJson } from "@/server/http/handler";
import { expenseLineSchema } from "@/server/validation";
import { saveExpenseLine } from "@/server/services/report-service";

export const POST = api(async ({ req, actor, params }) => saveExpenseLine(actor, params.id, null, await parseJson(req, expenseLineSchema)));
