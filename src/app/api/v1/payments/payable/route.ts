import { api } from "@/server/http/handler";
import { listPayableReports } from "@/server/services/payment-service";

export const GET = api(async ({ req, actor }) => listPayableReports(actor, req.nextUrl.searchParams.get("legalEntityId") ?? undefined));
