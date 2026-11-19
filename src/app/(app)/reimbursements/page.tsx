import { pageActor } from "@/server/auth/page";
import { listBatches, listPayableReports } from "@/server/services/payment-service";
import { PageHeader } from "@/components/ui/misc";
import { ReimbursementsView } from "./view";

export const metadata = { title: "Reimbursements" };

export default async function ReimbursementsPage() {
  const actor = await pageActor("payment:manage");
  const [payable, batches] = await Promise.all([listPayableReports(actor), listBatches(actor)]);
  return (
    <div>
      <PageHeader title="Reimbursements" description="Prepare payment batches from approved reports, release them to the bank and record the bank results." />
      <ReimbursementsView actorId={actor.id} payable={JSON.parse(JSON.stringify(payable))} batches={JSON.parse(JSON.stringify(batches))} />
    </div>
  );
}
