import { api, parseJson } from "@/server/http/handler";
import { notificationPrefSchema } from "@/server/validation";
import { getPreferences, setPreferences } from "@/server/services/notification-service";

export const GET = api(async ({ actor }) => getPreferences(actor.id));
export const PUT = api(async ({ req, actor }) => setPreferences(actor.id, (await parseJson(req, notificationPrefSchema)).prefs));
