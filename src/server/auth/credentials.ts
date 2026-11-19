import bcrypt from "bcryptjs";
import { prisma } from "../db";

/** Credential helpers with no dependency on the Next.js request context (usable from scripts and tests). */
export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return "Password must mix upper case, lower case and digits";
  return null;
}

export async function revokeAllSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}
