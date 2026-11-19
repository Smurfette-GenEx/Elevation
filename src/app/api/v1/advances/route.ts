import { api, parseJson } from "@/server/http/handler";
import { advanceSchema } from "@/server/validation";
import { listAdvances, requestAdvance } from "@/server/services/advance-service";

export const GET = api(async ({ actor }) => listAdvances(actor));
export const POST = api(async ({ req, actor }) => requestAdvance(actor, await parseJson(req, advanceSchema)));
