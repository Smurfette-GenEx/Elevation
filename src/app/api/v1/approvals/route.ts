import { api } from "@/server/http/handler";
import { listMyTasks } from "@/server/services/approval-service";

export const GET = api(async ({ req, actor }) => listMyTasks(actor, { includeDecided: req.nextUrl.searchParams.get("history") === "1" }));
