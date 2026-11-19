import { api, parseJson } from "@/server/http/handler";
import { exportSchema } from "@/server/validation";
import { createExport, listExports } from "@/server/services/accounting-service";

export const GET = api(async ({ actor }) => listExports(actor));
export const POST = api(async ({ req, actor }) => {
  const body = await parseJson(req, exportSchema);
  return createExport(actor, body.legalEntityId, body.kind);
});
