import { api } from "@/server/http/handler";
import { reconciliation } from "@/server/services/payment-service";
import { validation } from "@/server/errors";

export const GET = api(async ({ req, actor }) => {
  const id = req.nextUrl.searchParams.get("legalEntityId");
  if (!id) throw validation("legalEntityId is required");
  return reconciliation(actor, id);
});
