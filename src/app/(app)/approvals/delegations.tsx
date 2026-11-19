"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { UserPicker } from "@/components/app/user-picker";
import { apiFetch, errorMessage } from "@/lib/client-api";
import { date } from "@/lib/format";

type D = { id: string; fromUserId: string; startsAt: string; endsAt: string; reason: string | null; fromUser: { name: string }; toUser: { name: string } };

export function DelegationPanel({ actorId, delegations }: { actorId: string; delegations: D[] }) {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [startsAt, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [endsAt, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function create() {
    try {
      await apiFetch("/api/v1/delegations", { method: "POST", json: { toUserId: user?.id, startsAt, endsAt, reason: reason || null } });
      setUser(null); setEnd(""); setReason("");
      router.refresh();
    } catch (e) { setError(errorMessage(e)); }
  }
  return (
    <Card>
      <CardHeader><CardTitle>Out-of-office delegation</CardTitle><CardDescription>New approvals routed to you are sent to your delegate during this period.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {delegations.map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span>{d.fromUserId === actorId ? `To ${d.toUser.name}` : `From ${d.fromUser.name}`} · {date(d.startsAt)} → {date(d.endsAt)}</span>
            {d.fromUserId === actorId && <Button size="sm" variant="ghost" onClick={() => apiFetch(`/api/v1/delegations/${d.id}`, { method: "DELETE" }).then(() => router.refresh())}>Revoke</Button>}
          </div>
        ))}
        {error && <Alert tone="error">{error}</Alert>}
        <UserPicker value={user} onChange={setUser} label="Delegate to" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><Input type="date" value={startsAt} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Until"><Input type="date" value={endsAt} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <Field label="Reason (optional)"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="flex justify-end"><Button disabled={!user || !endsAt} onClick={create}>Create delegation</Button></div>
      </CardContent>
    </Card>
  );
}
