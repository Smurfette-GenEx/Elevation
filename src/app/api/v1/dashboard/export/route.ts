import { api, fileResponse } from "@/server/http/handler";
import { analytics } from "@/server/services/dashboard-service";
import { filtersFromSearch, permissionForView } from "@/server/services/dashboard-filters";
import { dashboardToPdf, dashboardToXlsx } from "@/server/services/report-export";
import { audit } from "@/server/infra/audit";

export const GET = api(async ({ req, actor }) => {
  const sp = req.nextUrl.searchParams;
  const data = await analytics(actor, permissionForView(sp.get("view")), filtersFromSearch(sp));
  const format = sp.get("format") === "pdf" ? "pdf" : "xlsx";
  await audit(actor, { action: "dashboard.exported", entityType: "Dashboard", entityId: sp.get("view") ?? "finance", data: { format, filters: { ...data.filters } } });
  return fileResponse(format === "pdf" ? await dashboardToPdf(data, actor.name) : await dashboardToXlsx(data));
});
