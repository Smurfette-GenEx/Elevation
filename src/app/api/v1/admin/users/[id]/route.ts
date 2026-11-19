import { api, parseJson } from "@/server/http/handler";
import { userSchema } from "@/server/validation";
import { saveUser } from "@/server/services/admin-service";

export const PUT = api(async ({ req, actor, params }) => { const { passwordHash, ...u } = await saveUser(actor, params.id, await parseJson(req, userSchema)); void passwordHash; return u; });
