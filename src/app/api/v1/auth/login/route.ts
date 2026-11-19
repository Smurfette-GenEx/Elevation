import { z } from "zod";
import { publicApi, parseJson } from "@/server/http/handler";
import { createSession, verifyCredentials, requestMeta } from "@/server/auth/session";
import { rateLimit } from "@/server/infra/rate-limit";
import { audit } from "@/server/infra/audit";
import { AppError } from "@/server/errors";

const schema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });

export const POST = publicApi(async ({ req }) => {
  const meta = await requestMeta();
  const { email, password } = await parseJson(req, schema);
  rateLimit(`login:ip:${meta.ip ?? "unknown"}`, 20, 15 * 60_000);
  rateLimit(`login:email:${email.toLowerCase()}`, 10, 15 * 60_000);
  const user = await verifyCredentials(email, password);
  if (!user) throw new AppError("UNAUTHENTICATED", "Invalid email or password");
  await createSession(user.id, meta);
  await audit({ id: user.id, groupId: user.groupId }, { action: "auth.login", entityType: "User", entityId: user.id }, undefined, meta.ip);
  return { ok: true };
});
