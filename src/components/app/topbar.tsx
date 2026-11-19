"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, LogOut } from "lucide-react";
import { apiFetch } from "@/lib/client-api";

export function Topbar({ name, roles, unread }: { name: string; roles: string[]; unread: number }) {
  const router = useRouter();
  async function logout() {
    await apiFetch("/api/v1/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
      <Link href="/notifications" className="relative rounded-md p-2 hover:bg-muted" aria-label={`Notifications (${unread} unread)`}>
        <Bell className="size-4" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">{unread > 99 ? "99+" : unread}</span>}
      </Link>
      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium leading-tight">{name}</p>
        <p className="max-w-80 truncate text-[11px] text-muted-foreground">{roles.join(" · ")}</p>
      </div>
      <button onClick={logout} className="rounded-md p-2 hover:bg-muted" aria-label="Sign out" title="Sign out"><LogOut className="size-4" /></button>
    </header>
  );
}
