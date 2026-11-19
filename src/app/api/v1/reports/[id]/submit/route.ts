import { api, parseJson } from "@/server/http/handler";
import { submitSchema } from "@/server/validation";
import { submitReport } from "@/server/services/report-service";

export const POST = api(async ({ req, actor, params }) => submitReport(actor, params.id, await parseJson(req, submitSchema)));
