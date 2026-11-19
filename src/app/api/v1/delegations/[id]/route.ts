import { api } from "@/server/http/handler";
import { revokeDelegation } from "@/server/services/approval-service";

export const DELETE = api(async ({ actor, params }) => revokeDelegation(actor, params.id));
