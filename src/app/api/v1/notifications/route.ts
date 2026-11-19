import { api, parseJson } from "@/server/http/handler";
import { z } from "zod";
import { listNotifications, markRead } from "@/server/services/notification-service";

export const GET = api(async ({ actor }) => listNotifications(actor.id));
export const POST = api(async ({ req, actor }) => {
  const b = await parseJson(req, z.object({ ids: z.union([z.array(z.string()).max(500), z.literal("all")]) }));
  return markRead(actor.id, b.ids);
});
