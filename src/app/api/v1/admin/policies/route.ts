import { api, parseJson } from "@/server/http/handler";
import { policyRuleSchema } from "@/server/validation";
import { listPolicyRules, savePolicyRule } from "@/server/services/admin-service";

export const GET = api(async ({ actor }) => listPolicyRules(actor));
export const POST = api(async ({ req, actor }) => savePolicyRule(actor, null, await parseJson(req, policyRuleSchema)));
