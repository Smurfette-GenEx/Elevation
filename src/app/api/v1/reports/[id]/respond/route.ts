import { api, parseJson } from "@/server/http/handler";
import { commentSchema } from "@/server/validation";
import { respondToInfoRequest } from "@/server/services/report-service";

export const POST = api(async ({ req, actor, params }) => respondToInfoRequest(actor, params.id, (await parseJson(req, commentSchema)).body));
