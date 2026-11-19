import { api } from "@/server/http/handler";
import { receiptUrl } from "@/server/services/receipt-service";

export const GET = api(async ({ actor, params }) => receiptUrl(actor, params.id));
