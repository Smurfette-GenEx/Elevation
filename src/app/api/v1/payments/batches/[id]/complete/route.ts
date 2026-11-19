import { api, parseJson } from "@/server/http/handler";
import { completeBatchSchema } from "@/server/validation";
import { completeBatch } from "@/server/services/payment-service";

export const POST = api(async ({ req, actor, params }) => completeBatch(actor, params.id, (await parseJson(req, completeBatchSchema)).results));
