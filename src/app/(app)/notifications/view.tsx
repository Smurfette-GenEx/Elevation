"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client-api";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type N = { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };
type P = { type: string; label: string; inApp: boolean; email: boolean };

export function NotificationsView({ items, prefs: initial }: { items: N[]; prefs: P[] }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial);
  const [saved, setSaved] = useState(false);
  const read = (ids: string[] | "all") => apiFetch("/api/v1/notifications", { method: "POST", json: { ids } }).then(() => router.refresh());
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex-row items-center justify-between"><CardTitle>Inbox</CardTitle><Button size="sm" variant="ghost" onClick={() => read("all")}>Mark all as read</Button></CardHeader>
        <CardContent className="divide-y p-0">
          {items.length === 0 && <p className="p-5 text-sm text-muted-foreground">No notifications.</p>}
          {items.map((n) => (
            <div key={n.id} className={cn("flex gap-3 px-5 py-3", !n.readAt && "bg-accent/40")}>
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-label={n.readAt ? undefined : "unread"} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{n.link ? <Link href={n.link} onClick={() => !n.readAt && read([n.id])} className="hover:underline">{n.title}</Link> : n.title}</p>
                <p className="whitespace-pre-wrap text-xs text-muted-foreground">{n.body}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{dateTime(n.createdAt)}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Preferences</CardTitle><CardDescription>Choose how you are notified for each event.</CardDescription></CardHeader>
        <CardContent>
          <table className="w-full text-sm"><thead><tr className="text-xs text-muted-foreground"><th className="text-left font-medium">Event</th><th className="font-medium">In-app</th><th className="font-medium">Email</th></tr></thead>
            <tbody>{prefs.map((p, i) => (
              <tr key={p.type} className="border-t"><td className="py-2">{p.label}</td>
                {(["inApp", "email"] as const).map((k) => <td key={k} className="text-center"><input type="checkbox" aria-label={`${p.label} ${k}`} checked={p[k]} onChange={(e) => { const n = [...prefs]; n[i] = { ...p, [k]: e.target.checked }; setPrefs(n); setSaved(false); }} /></td>)}
              </tr>))}</tbody></table>
          <div className="mt-4 flex items-center justify-end gap-2">{saved && <span className="text-xs text-success">Saved</span>}<Button size="sm" onClick={() => apiFetch("/api/v1/notifications/preferences", { method: "PUT", json: { prefs } }).then(() => setSaved(true))}>Save preferences</Button></div>
          <p className="mt-4 text-xs text-muted-foreground"><a href="/api/v1/me/personal-data" className="text-primary hover:underline">Download my personal data (GDPR)</a></p>
        </CardContent>
      </Card>
    </div>
  );
}
