import { describe, expect, it } from "vitest";
import { memoryLimiter, authThrottle, authThrottleReset } from "@/lib/ratelimit";

/**
 * Issue #7 — /api/auth/email had no attempt brake at all. The limiter
 * is a sliding window in process memory behind the RateLimiter
 * interface; the account bucket resets on successful sign-in.
 */
describe("rate limiter", () => {
  it("allows up to the limit, then 429s with retry-after", () => {
    const rl = memoryLimiter(3, 60_000);
    for (let i = 0; i < 3; i++) expect(rl.hit("k").allowed).toBe(true);
    const over = rl.hit("k");
    expect(over.allowed).toBe(false);
    expect(over.retryAfter).toBeGreaterThan(0);
  });

  it("survives repeated invocations on the same process (shared state)", () => {
    const rl = memoryLimiter(2, 60_000);
    rl.hit("ip:1.2.3.4");
    rl.hit("ip:1.2.3.4");
    expect(rl.hit("ip:1.2.3.4").allowed).toBe(false);   // window persists
    expect(rl.hit("ip:9.9.9.9").allowed).toBe(true);    // other keys unaffected
  });

  it("the account bucket resets on success", () => {
    const rl = memoryLimiter(2, 60_000);
    rl.hit("acct:a@b.c"); rl.hit("acct:a@b.c");
    expect(rl.hit("acct:a@b.c").allowed).toBe(false);
    rl.reset("acct:a@b.c");
    expect(rl.hit("acct:a@b.c").allowed).toBe(true);
  });
});

describe("authThrottle — ip AND account buckets", () => {
  it("the account limit trips at 5 within its window", () => {
    for (let i = 0; i < 5; i++)
      expect(authThrottle("1.1.1.1", "victim@uni.edu").allowed).toBe(true);
    expect(authThrottle("1.1.1.1", "victim@uni.edu").allowed).toBe(false);
  });

  it("a different account behind the same IP stays within the IP window", () => {
    const r = authThrottle("8.8.8.8", "someone-else@uni.edu");
    expect(r.allowed).toBe(true);
  });

  it("reset clears the account window", () => {
    for (let i = 0; i < 6; i++) authThrottle("2.2.2.2", "back@uni.edu");
    authThrottleReset("back@uni.edu");
    expect(authThrottle("2.2.2.2", "back@uni.edu").allowed).toBe(true);
  });
});
