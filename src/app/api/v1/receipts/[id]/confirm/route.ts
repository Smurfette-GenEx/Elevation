import { api } from "@/server/http/handler";
import { confirmOcr } from "@/server/services/receipt-service";

export const POST = api(async ({ actor, params }) => confirmOcr(actor, params.id));
