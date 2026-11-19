import { api, parseJson } from "@/server/http/handler";
import { commentSchema } from "@/server/validation";
import { addComment } from "@/server/services/report-service";

export const POST = api(async ({ req, actor, params }) => addComment(actor, params.id, (await parseJson(req, commentSchema)).body));
