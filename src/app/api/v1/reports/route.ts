import { api, parseJson } from "@/server/http/handler";
import { createReportSchema } from "@/server/validation";
import { createReport, listReports } from "@/server/services/report-service";
import type { ReportStatus } from "@/server/domain/approval-engine";

export const GET = api(async ({ req, actor }) => {
  const sp = req.nextUrl.searchParams;
  return listReports(actor, {
    mine: sp.get("mine") === "1",
    status: sp.get("status")?.split(",").filter(Boolean) as ReportStatus[] | undefined,
    legalEntityId: sp.get("legalEntityId") ?? undefined,
    q: sp.get("q") ?? undefined,
    take: Number(sp.get("take") ?? 50),
    skip: Number(sp.get("skip") ?? 0),
  });
});

export const POST = api(async ({ req, actor }) => createReport(actor, await parseJson(req, createReportSchema)));
