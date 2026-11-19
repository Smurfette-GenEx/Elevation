import { api, parseJson } from "@/server/http/handler";
import { z } from "zod";
import { markAdvancePaid } from "@/server/services/advance-service";

export const POST = api(async ({ req, actor, params }) => markAdvancePaid(actor, params.id, (await parseJson(req, z.object({ paymentRef: z.string().min(3).max(60) }))).paymentRef));
