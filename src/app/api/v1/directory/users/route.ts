import { api } from "@/server/http/handler";
import { userDirectory } from "@/server/services/admin-service";

export const GET = api(async ({ req, actor }) => userDirectory(actor, (req.nextUrl.searchParams.get("q") ?? "").slice(0, 60)));
