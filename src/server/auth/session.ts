import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { prisma } from "../db";
import { config } from "../config";
import { unauthenticated, AppError } from "../errors";
import type { Actor } from "./scope";

export const SESSION_COOKIE = "xp_session";
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export { hashPassword, validatePasswordStrength, revokeAllSessions } from "./credentials";

// Constant-time-ish dummy hash so unknown emails take as long as wrong passwords (no user enumeration)
let dummyHash: string | null = null;
const getDummyHash = async () => (dummyHash ??= await bcrypt.hash("timing-equalisation", 12));

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.passwordHash || !user.active || user.anonymizedAt) {
    await bcrypt.compare(password, await getDummyHash());
    return null;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError("RATE_LIMITED", "Account temporarily locked after repeated failed attempts. Try again later.");
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    return null;
  }
  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  return user;
}

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = randomBytes(32).toString("base64url");
  const ttlHours = config().SESSION_TTL_HOURS;
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
  await prisma.session.create({
    data: { id: hashToken(token), userId, expiresAt, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 255) ?? null },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // HTTPS-only whenever the app is served over HTTPS (always the case in production behind TLS)
    secure: config().APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}


/** Loads the current actor from the session cookie. Memoised per request. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    include: { user: { include: { roles: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  // Sliding activity tracking (cheap; at most once per 5 minutes)
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  const u = session.user;
  return {
    id: u.id,
    groupId: u.groupId,
    name: u.name,
    email: u.email,
    legalEntityId: u.legalEntityId,
    departmentId: u.departmentId,
    costCenterId: u.costCenterId,
    countryCode: u.countryCode,
    locale: u.locale,
    roles: u.roles.map((r) => ({ role: r.role, scopeType: r.scopeType, scopeId: r.scopeId })),
  };
});

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw unauthenticated();
  return actor;
}

export async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
    userAgent: h.get("user-agent"),
  };
}
