import { notFound } from "next/navigation";
import { pageActor } from "@/server/auth/page";
import { getReportDetail } from "@/server/services/report-service";
import { expenseFormReference } from "@/server/services/reference-service";
import { AppError } from "@/server/errors";
import { ReportView } from "./report-view";

export const metadata = { title: "Expense report" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await pageActor();
  const { id } = await params;
  let detail;
  try {
    detail = await getReportDetail(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const reference = detail.permissions.canEdit ? await expenseFormReference(actor) : null;
  // Serialise Prisma Decimals/Dates into plain JSON for the client component
  const data = JSON.parse(JSON.stringify({ ...detail, reference, actorId: actor.id }));
  return <ReportView data={data} />;
}
