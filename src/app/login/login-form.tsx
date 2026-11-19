"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { apiFetch, errorMessage } from "@/lib/client-api";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/v1/auth/login", { method: "POST", json: { email: fd.get("email"), password: fd.get("password") } });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Email"><Input name="email" type="email" autoComplete="username" required autoFocus /></Field>
      <Field label="Password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
      <Button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
