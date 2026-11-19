import { api, parseJson } from "@/server/http/handler";
import { workflowSchema } from "@/server/validation";
import { saveWorkflow } from "@/server/services/admin-service";

export const PUT = api(async ({ req, actor, params }) => saveWorkflow(actor, params.id, await parseJson(req, workflowSchema)));
