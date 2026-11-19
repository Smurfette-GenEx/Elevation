import { api, parseJson } from "@/server/http/handler";
import { fxOverrideSchema } from "@/server/validation";
import { overrideFxRate } from "@/server/services/report-service";

export const POST = api(async ({ req, actor, params }) => overrideFxRate(actor, params.id, params.lineId, await parseJson(req, fxOverrideSchema)));
