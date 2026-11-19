import { api, parseJson } from "@/server/http/handler";
import { userSchema } from "@/server/validation";
import { listUsers, saveUser } from "@/server/services/admin-service";

export const GET = api(async ({ req, actor }) => (await listUsers(actor, req.nextUrl.searchParams.get("q") ?? undefined)).map(({ passwordHash, ...u }) => { void passwordHash; return u; }));
export const POST = api(async ({ req, actor }) => { const { passwordHash, ...u } = await saveUser(actor, null, await parseJson(req, userSchema)); void passwordHash; return u; });
