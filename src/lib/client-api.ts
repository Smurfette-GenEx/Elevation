"use client";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export async function apiFetch<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
    throw new ApiError(res.status, body?.error?.code ?? "ERROR", body?.error?.message ?? res.statusText, body?.error?.details);
  }
  return body as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const details = Array.isArray(e.details) ? e.details.map((d: { path?: string; message: string }) => (d.path ? `${d.path}: ${d.message}` : d.message)).join("; ") : "";
    return details ? `${e.message} — ${details}` : e.message;
  }
  return e instanceof Error ? e.message : "Unexpected error";
}
