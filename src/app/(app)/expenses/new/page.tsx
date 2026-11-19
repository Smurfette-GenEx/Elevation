import { pageActor } from "@/server/auth/page";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/ui/misc";
import { NewReportForm } from "./form";

export const metadata = { title: "New expense report" };

export default async function NewReportPage() {
  const actor = await pageActor("report:create");
  const trips = await prisma.trip.findMany({ where: { employeeId: actor.id, status: { not: "CANCELLED" } }, orderBy: { startDate: "desc" }, take: 20 });
  return (
    <div className="max-w-2xl">
      <PageHeader title="New expense report" description="Group related expenses (e.g. one trip or one month) in a single report. You can save it as a draft." />
      <NewReportForm trips={trips.map((t) => ({ id: t.id, label: `${t.destinationCity} — ${t.purpose} (${t.startDate.toISOString().slice(0, 10)})` }))} />
    </div>
  );
}
