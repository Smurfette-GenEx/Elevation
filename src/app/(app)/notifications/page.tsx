import { pageActor } from "@/server/auth/page";
import { getPreferences, listNotifications } from "@/server/services/notification-service";
import { PageHeader } from "@/components/ui/misc";
import { NotificationsView } from "./view";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const actor = await pageActor();
  const [list, prefs] = await Promise.all([listNotifications(actor.id, 100), getPreferences(actor.id)]);
  return (
    <div>
      <PageHeader title="Notifications" />
      <NotificationsView items={JSON.parse(JSON.stringify(list.items))} prefs={prefs} />
    </div>
  );
}
