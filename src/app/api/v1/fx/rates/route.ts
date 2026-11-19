import { api, parseJson } from "@/server/http/handler";
import { manualRateSchema } from "@/server/validation";
import { addManualRate, listRates } from "@/server/services/fx-service";

export const GET = api(async ({ req }) => listRates({ currency: req.nextUrl.searchParams.get("currency") ?? undefined }));
export const POST = api(async ({ req, actor }) => addManualRate(actor, await parseJson(req, manualRateSchema)));
