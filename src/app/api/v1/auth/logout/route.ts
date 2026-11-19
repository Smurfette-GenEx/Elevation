import { publicApi } from "@/server/http/handler";
import { destroySession } from "@/server/auth/session";

export const POST = publicApi(async () => {
  await destroySession();
  return { ok: true };
});
