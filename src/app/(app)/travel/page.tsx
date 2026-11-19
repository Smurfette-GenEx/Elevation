import { pageActor } from "@/server/auth/page";
import { can } from "@/server/auth/scope";
import { listAdvances, listTrips } from "@/server/services/advance-service";
import { PageHeader } from "@/components/ui/misc";
import { TravelView } from "./travel-view";

export const metadata = { title: "Trips & advances" };

export default async function TravelPage() {
  const actor = await pageActor("report:create");
  const [trips, advances] = await Promise.all([listTrips(actor), listAdvances(actor)]);
  return (
    <div>
      <PageHeader title="Trips & advances" description="Plan business trips and request cash advances. Paid advances are automatically offset against your next approved expense reports." />
      <TravelView actorId={actor.id} canPay={can(actor, "payment:manage")} trips={JSON.parse(JSON.stringify(trips))} advances={JSON.parse(JSON.stringify(advances))} />
    </div>
  );
}
