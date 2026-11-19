import { api } from "@/server/http/handler";
import { ROLE_LABELS } from "@/server/auth/rbac";

export const GET = api(async ({ actor }) => ({ ...actor, roleLabels: actor.roles.map((r) => ROLE_LABELS[r.role]) }));
