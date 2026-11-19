import { api, parseJson } from "@/server/http/handler";
import { reassignSchema } from "@/server/validation";
import { reassignTask } from "@/server/services/approval-service";

export const POST = api(async ({ req, actor, params }) => {
  const body = await parseJson(req, reassignSchema);
  return reassignTask(actor, params.taskId, body.toUserId, body.reason);
});
