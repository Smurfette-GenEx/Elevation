import { api, parseJson } from "@/server/http/handler";
import { paymentBatchSchema } from "@/server/validation";
import { createBatch, listBatches } from "@/server/services/payment-service";

export const GET = api(async ({ actor }) => listBatches(actor));
export const POST = api(async ({ req, actor }) => createBatch(actor, await parseJson(req, paymentBatchSchema)));
