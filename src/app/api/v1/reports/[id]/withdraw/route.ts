import { api } from "@/server/http/handler";
import { withdrawReport } from "@/server/services/report-service";

export const POST = api(async ({ actor, params }) => withdrawReport(actor, params.id));
