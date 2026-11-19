import * as React from "react";
import { cn } from "@/lib/utils";

export function Progress({ value, className, tone }: { value: number; className?: string; tone?: "default" | "warning" | "destructive" | "success" }) {
  const color = tone === "destructive" ? "bg-destructive" : tone === "warning" ? "bg-warning" : tone === "success" ? "bg-success" : "bg-primary";
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "warning" | "error" | "success"; title?: string; children?: React.ReactNode; className?: string }) {
  const styles = {
    info: "border-primary/30 bg-accent text-accent-foreground",
    warning: "border-warning/40 bg-warning/10",
    error: "border-destructive/40 bg-destructive/10 text-destructive",
    success: "border-success/40 bg-success/10",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-md border px-4 py-3 text-sm", styles, className)}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cn(title && "mt-1 opacity-90")}>{children}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "default" | "warning" | "destructive" | "success" }) {
  const accent = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-[color-mix(in_oklch,var(--warning),black_30%)] dark:text-warning" : tone === "success" ? "text-success" : "";
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 text-2xl font-semibold tabular tracking-tight", accent)}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
