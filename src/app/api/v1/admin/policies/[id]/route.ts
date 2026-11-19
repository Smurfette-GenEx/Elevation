import { api, parseJson } from "@/server/http/handler";
import { policyRuleSchema } from "@/server/validation";
import { savePolicyRule } from "@/server/services/admin-service";

export const PUT = api(async ({ req, actor, params }) => savePolicyRule(actor, params.id, await parseJson(req, policyRuleSchema)));
