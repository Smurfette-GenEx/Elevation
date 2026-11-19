import { pageActor } from "@/server/auth/page";
import { can } from "@/server/auth/scope";
import { ROLE_LABELS } from "@/server/auth/rbac";
import { prisma } from "@/server/db";
import { Sidebar, type NavItem } from "@/components/app/sidebar";
import { Topbar } from "@/components/app/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await pageActor();
  const [pendingTasks, unread, entity] = await Promise.all([
    prisma.approvalTask.count({ where: { approverId: actor.id, status: "PENDING" } }),
    prisma.notification.count({ where: { userId: actor.id, readAt: null } }),
    prisma.legalEntity.findUnique({ where: { id: actor.legalEntityId }, select: { code: true, name: true } }),
  ]);
  const admin = can(actor, "user:manage") || can(actor, "policy:manage") || can(actor, "workflow:manage") || can(actor, "fx:manage") || can(actor, "audit:read");
  const nav: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    ...(can(actor, "report:create") ? [{ href: "/expenses", label: "Expense reports", icon: "receipt" } as NavItem] : []),
    { href: "/approvals", label: "Approvals", icon: "check", badge: pendingTasks || undefined },
    ...(can(actor, "report:create") ? [{ href: "/travel", label: "Trips & advances", icon: "plane" } as NavItem] : []),
    ...(can(actor, "budget:read") ? [{ href: "/budgets", label: "Budgets", icon: "wallet" } as NavItem] : []),
    ...(can(actor, "payment:manage") ? [{ href: "/reimbursements", label: "Reimbursements", icon: "banknote" } as NavItem] : []),
    ...(can(actor, "accounting:export") ? [{ href: "/accounting", label: "Accounting", icon: "book" } as NavItem] : []),
    ...(admin ? [{ href: "/admin", label: "Administration", icon: "settings" } as NavItem] : []),
  ];
  const roles = [...new Set(actor.roles.map((r) => ROLE_LABELS[r.role]))];
  return (
    <div className="flex min-h-screen">
      <Sidebar items={nav} entity={entity ? `${entity.code} · ${entity.name}` : ""} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar name={actor.name} roles={roles} unread={unread} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
