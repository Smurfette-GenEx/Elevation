import { api, parseJson } from "@/server/http/handler";
import { exceptionDecisionSchema } from "@/server/validation";
import { decideException } from "@/server/services/approval-service";

export const POST = api(async ({ req, actor, params }) => {
  const body = await parseJson(req, exceptionDecisionSchema);
  return decideException(actor, params.id, body.approve, body.note);
});
