"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BookOpen, Banknote, CheckSquare, LayoutDashboard, Menu, Plane, Receipt, Settings, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = { dashboard: LayoutDashboard, receipt: Receipt, check: CheckSquare, plane: Plane, wallet: Wallet, banknote: Banknote, book: BookOpen, settings: Settings };
export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number };

export function Sidebar({ items, entity }: { items: NavItem[]; entity: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const active = path === it.href || path.startsWith(`${it.href}/`);
        return (
          <Link key={it.href} href={it.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-active hover:text-sidebar-foreground", active && "bg-sidebar-active font-medium text-sidebar-foreground")}>
            <Icon className="size-4" />
            <span className="flex-1">{it.label}</span>
            {it.badge ? <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{it.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
  const brand = (
    <div className="px-6 py-5">
      <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold text-sidebar-foreground">
        <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">A</span> Atlas Expenses
      </Link>
      <p className="mt-2 truncate text-[11px] text-sidebar-muted" title={entity}>{entity}</p>
    </div>
  );
  return (
    <>
      <button className="fixed left-3 top-3 z-40 rounded-md border bg-card p-2 shadow-sm lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-4" /></button>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar lg:flex">{brand}{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <aside className="flex w-64 flex-col bg-sidebar">
            <div className="flex items-start justify-between">{brand}<button onClick={() => setOpen(false)} className="m-4 text-sidebar-muted" aria-label="Close menu"><X className="size-4" /></button></div>
            {nav}
          </aside>
          <button className="flex-1 bg-black/40" onClick={() => setOpen(false)} aria-label="Close menu overlay" />
        </div>
      )}
    </>
  );
}
