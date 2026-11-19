import { api, fileResponse } from "@/server/http/handler";
import { renderExport } from "@/server/services/accounting-service";

export const GET = api(async ({ req, actor, params }) => fileResponse(await renderExport(actor, params.id, req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv")));
