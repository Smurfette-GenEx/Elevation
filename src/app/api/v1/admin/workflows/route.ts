import { api, parseJson } from "@/server/http/handler";
import { workflowSchema } from "@/server/validation";
import { listWorkflows, saveWorkflow } from "@/server/services/admin-service";

export const GET = api(async ({ actor }) => listWorkflows(actor));
export const POST = api(async ({ req, actor }) => saveWorkflow(actor, null, await parseJson(req, workflowSchema)));
