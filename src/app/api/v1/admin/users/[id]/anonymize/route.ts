import { api } from "@/server/http/handler";
import { anonymizeUser } from "@/server/services/admin-service";

export const POST = api(async ({ actor, params }) => anonymizeUser(actor, params.id));
