import { api } from "@/server/http/handler";
import { analytics } from "@/server/services/dashboard-service";
import { filtersFromSearch, permissionForView } from "@/server/services/dashboard-filters";

export const GET = api(async ({ req, actor }) => analytics(actor, permissionForView(req.nextUrl.searchParams.get("view")), filtersFromSearch(req.nextUrl.searchParams)));
