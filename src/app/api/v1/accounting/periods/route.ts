import { api, parseJson } from "@/server/http/handler";
import { z } from "zod";
import { setPeriodStatus } from "@/server/services/accounting-service";

const schema = z.object({ legalEntityId: z.string(), period: z.string().regex(/^\d{4}-\d{2}$/), status: z.enum(["OPEN", "CLOSED"]) });
export const POST = api(async ({ req, actor }) => {
  const b = await parseJson(req, schema);
  return setPeriodStatus(actor, b.legalEntityId, b.period, b.status);
});
