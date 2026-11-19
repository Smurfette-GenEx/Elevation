import { api } from "@/server/http/handler";
import { previewPolicies } from "@/server/services/report-service";

export const GET = api(async ({ actor, params }) => previewPolicies(actor, params.id));
