/**
 * In-memory sliding-window limiter (issue #7).
 *
 * The container deploys single-process, so a process-local map is the
 * honest default — behind this interface so a Redis/Upstash store can
 * replace it in a multi-replica deployment without touching callers.
 */

export interface RateLimiter {
  /** Record an attempt; allowed=false when the window is exhausted. */
  hit(key: string): { allowed: boolean; retryAfter: number };
  /** Clear the window for a key (e.g. on successful sign-in). */
  reset(key: string): void;
}

interface Window {
  count: number;
  resetAt: number;
}

export function memoryLimiter(limit: number, windowMs: number): RateLimiter {
  const windows = new Map<string, Window>();
  return {
    hit(key: string) {
      const now = Date.now();
      let w = windows.get(key);
      if (!w || now >= w.resetAt) {
        w = { count: 0, resetAt: now + windowMs };
        windows.set(key, w);
      }
      w.count++;
      return { allowed: w.count <= limit, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
    },
    reset(key: string) {
      windows.delete(key);
    },
  };
}

/** /api/auth/email: per-IP AND per-account buckets. */
const ipLimiter = memoryLimiter(10, 5 * 60 * 1000);        // 10 / 5min per IP
const acctLimiter = memoryLimiter(5, 15 * 60 * 1000);      // 5 / 15min per email

export function authThrottle(ip: string | null, email: string) {
  const byIp = ipLimiter.hit(`ip:${ip ?? "unknown"}`);
  const byAcct = acctLimiter.hit(`acct:${email}`);
  if (!byIp.allowed) return byIp;
  return byAcct;
}

export function authThrottleReset(email: string) {
  acctLimiter.reset(`acct:${email}`);
}
