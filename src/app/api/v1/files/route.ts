import { NextResponse, type NextRequest } from "next/server";
import { storage, verifySignature } from "@/server/infra/storage";
import { getActor } from "@/server/auth/session";

const TYPES: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

/** Serves private files for the local storage driver. Requires BOTH a valid session and a valid, unexpired signature. */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const exp = Number(req.nextUrl.searchParams.get("exp"));
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  if (!(await getActor()) || !verifySignature(key, exp, sig)) return NextResponse.json({ error: { code: "FORBIDDEN", message: "Link expired or invalid" } }, { status: 403 });
  try {
    const body = await storage().get(key);
    const ext = key.split(".").pop()!.toLowerCase();
    return new Response(new Uint8Array(body), {
      headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'" },
    });
  } catch {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "File not found" } }, { status: 404 });
  }
}
