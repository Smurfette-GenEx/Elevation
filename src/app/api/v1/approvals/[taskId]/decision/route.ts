import { api, parseJson } from "@/server/http/handler";
import { decisionSchema } from "@/server/validation";
import { decideTask } from "@/server/services/approval-service";

export const POST = api(async ({ req, actor, params }) => {
  const body = await parseJson(req, decisionSchema);
  return decideTask(actor, params.taskId, body.decision, body.comment);
});
