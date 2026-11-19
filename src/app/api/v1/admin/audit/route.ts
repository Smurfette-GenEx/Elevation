import { api } from "@/server/http/handler";
import { queryAuditLog } from "@/server/services/admin-service";

export const GET = api(async ({ req, actor }) => {
  const sp = req.nextUrl.searchParams;
  return queryAuditLog(actor, { entityType: sp.get("entityType") ?? undefined, entityId: sp.get("entityId") ?? undefined, actorId: sp.get("actorId") ?? undefined, action: sp.get("action") ?? undefined, take: Number(sp.get("take") ?? 200) });
});
