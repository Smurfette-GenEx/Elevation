import { api } from "@/server/http/handler";
import { exportPersonalData } from "@/server/services/admin-service";

export const GET = api(async ({ actor, params }) => exportPersonalData(actor, params.id));
