import { pageActor } from "@/server/auth/page";
import { listExports } from "@/server/services/accounting-service";
import { PageHeader } from "@/components/ui/misc";
import { AccountingView } from "./view";

export const metadata = { title: "Accounting" };

export default async function AccountingPage() {
  const actor = await pageActor("accounting:export");
  const data = await listExports(actor);
  return (
    <div>
      <PageHeader title="Accounting & ERP export" description="Balanced journals per legal entity, mapped to each entity's chart of accounts, VAT codes and ERP import layout. A report can only be exported once." />
      <AccountingView data={JSON.parse(JSON.stringify(data))} />
    </div>
  );
}
