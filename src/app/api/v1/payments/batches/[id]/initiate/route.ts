import { api } from "@/server/http/handler";
import { initiateBatch } from "@/server/services/payment-service";

export const POST = api(async ({ actor, params }) => initiateBatch(actor, params.id));
