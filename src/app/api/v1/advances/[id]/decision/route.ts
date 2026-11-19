import { api, parseJson } from "@/server/http/handler";
import { z } from "zod";
import { decideAdvance } from "@/server/services/advance-service";

export const POST = api(async ({ req, actor, params }) => decideAdvance(actor, params.id, (await parseJson(req, z.object({ approve: z.boolean() }))).approve));
