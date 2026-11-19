import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { Prisma } from "@prisma/client";
import { AppError, validation } from "../errors";
import { requireActor } from "../auth/session";
import type { Actor } from "../auth/scope";
import { config } from "../config";
import { rateLimit } from "../infra/rate-limit";

type Params = Record<string, string>;
type Ctx = { params: Promise<Params> };

/**
 * CSRF defence for cookie-authenticated mutations: the Origin (or Referer) header must
 * match the application origin. Complements SameSite=Lax cookies.
 */
function assertSameOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin") ?? (req.headers.get("referer") ? new URL(req.headers.get("referer")!).origin : null);
  const allowed = new Set([new URL(config().APP_URL).origin, req.nextUrl.origin]);
  // Behind a reverse proxy the public host arrives in X-Forwarded-Host / Host: compare hosts.
  const hosts = new Set([req.headers.get("x-forwarded-host"), req.headers.get("host")].filter(Boolean).flatMap((h) => h!.split(",").map((x) => x.trim())));
  const sameHost = origin ? hosts.has(new URL(origin).host) : false;
  if (!origin || (!allowed.has(origin) && !sameHost)) throw new AppError("FORBIDDEN", "Cross-origin request blocked");
}

export function toErrorResponse(e: unknown) {
  if (e instanceof AppError) return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  if (e instanceof ZodError) {
    return NextResponse.json({ error: { code: "VALIDATION", message: "Invalid input", details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } }, { status: 400 });
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return NextResponse.json({ error: { code: "CONFLICT", message: "A record with these values already exists" } }, { status: 409 });
    if (e.code === "P2025") return NextResponse.json({ error: { code: "NOT_FOUND", message: "Record not found" } }, { status: 404 });
  }
  console.error("[api] unhandled error", e);
  return NextResponse.json({ error: { code: "INTERNAL", message: "An unexpected error occurred" } }, { status: 500 });
}

export async function parseJson<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw validation("Request body must be valid JSON");
  }
  return schema.parse(body);
}

/** Authenticated API route. */
export function api(fn: (args: { req: NextRequest; actor: Actor; params: Params }) => Promise<unknown>) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      assertSameOrigin(req);
      const actor = await requireActor();
      if (req.method !== "GET") rateLimit(`mut:${actor.id}`, 120, 60_000);
      const result = await fn({ req, actor, params: await ctx.params });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      return toErrorResponse(e);
    }
  };
}

/** Unauthenticated route (login, health, cron with its own secret). */
export function publicApi(fn: (args: { req: NextRequest; params: Params }) => Promise<unknown>, opts: { csrf?: boolean } = { csrf: true }) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      if (opts.csrf !== false) assertSameOrigin(req);
      const result = await fn({ req, params: await ctx.params });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      return toErrorResponse(e);
    }
  };
}

export function fileResponse(file: { fileName: string; contentType: string; body: Buffer }) {
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.fileName.replace(/[^\w.\-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
