"use client";
import { useEffect, useState } from "react";
import { Field, Input } from "@/components/ui/form";
import { apiFetch } from "@/lib/client-api";

type U = { id: string; name: string; legalEntity: { code: string } };

export function UserPicker({ value, onChange, label = "Colleague" }: { value: { id: string; name: string } | null; onChange: (u: { id: string; name: string } | null) => void; label?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<U[]>([]);
  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(() => apiFetch<U[]>(`/api/v1/directory/users?q=${encodeURIComponent(q)}`).then(setResults).catch(() => setResults([])), 200);
    return () => clearTimeout(t);
  }, [q]);
  if (value) return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">{value.name}<button type="button" className="text-xs text-primary" onClick={() => onChange(null)}>Change</button></div>
    </div>
  );
  return (
    <div className="flex flex-col gap-1.5">
      <Field label={label}><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name or email…" /></Field>
      {results.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-md border bg-card text-sm shadow-sm">
          {results.map((u) => <li key={u.id}><button type="button" className="w-full px-3 py-1.5 text-left hover:bg-muted" onClick={() => onChange({ id: u.id, name: u.name })}>{u.name} <span className="text-xs text-muted-foreground">{u.legalEntity.code}</span></button></li>)}
        </ul>
      )}
    </div>
  );
}
