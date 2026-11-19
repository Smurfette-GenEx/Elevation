import { redirect } from "next/navigation";
import { getActor } from "./session";
import { can, type Actor } from "./scope";
import type { Permission } from "./rbac";

/** For server components: returns the actor or redirects to login. */
export async function pageActor(permission?: Permission): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (permission && !can(actor, permission)) redirect("/dashboard?denied=1");
  return actor;
}
