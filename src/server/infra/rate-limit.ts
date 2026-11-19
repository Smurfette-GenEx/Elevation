import { AppError } from "../errors";

/**
 * Fixed-window in-memory rate limiter. Adequate for a single instance; for horizontal
 * scaling replace the Map with Redis (INCR + EXPIRE) behind the same function signature.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count++;
  if (b.count > limit) throw new AppError("RATE_LIMITED", "Too many requests, please slow down");
  if (buckets.size > 50_000) for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
}
