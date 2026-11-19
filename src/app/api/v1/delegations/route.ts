import { api, parseJson } from "@/server/http/handler";
import { delegationSchema } from "@/server/validation";
import { createDelegation, listDelegations } from "@/server/services/approval-service";

export const GET = api(async ({ actor }) => listDelegations(actor));
export const POST = api(async ({ req, actor }) => createDelegation(actor, await parseJson(req, delegationSchema)));
