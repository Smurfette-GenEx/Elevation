import { api, parseJson } from "@/server/http/handler";
import { updateReportSchema } from "@/server/validation";
import { deleteDraft, getReportDetail, updateReportHeader } from "@/server/services/report-service";

export const GET = api(async ({ actor, params }) => getReportDetail(actor, params.id));
export const PATCH = api(async ({ req, actor, params }) => updateReportHeader(actor, params.id, await parseJson(req, updateReportSchema)));
export const DELETE = api(async ({ actor, params }) => deleteDraft(actor, params.id));
