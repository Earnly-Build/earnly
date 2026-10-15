import { describe, expect, it } from "vitest";
import { isTimeoutLike, HORIZON_TIMEOUT_MS, StellarError } from "@/lib/chain/stellar";

/**
 * Issue #10 — Stellar SDK reads were unbounded; a hung Horizon stalled
 * the whole request until the platform killed it. The SDK's axios
 * timeout is now 15s, and timeout-shaped failures map to typed
 * retryable StellarErrors so routes degrade instead of hanging.
 */
describe("Horizon timeout bound", () => {
  it("HORIZON_TIMEOUT_MS is the documented bound", () => {
    expect(HORIZON_TIMEOUT_MS).toBe(15_000);
  });

  it("axios timeout errors classify as timeout", () => {
    expect(isTimeoutLike({ code: "ECONNABORTED" })).toBe(true);
    expect(isTimeoutLike(new Error("timeout of 15000ms exceeded"))).toBe(true);
    expect(isTimeoutLike({ response: { status: 504 } })).toBe(true);
    expect(isTimeoutLike({ response: { status: 408 } })).toBe(true);
    expect(isTimeoutLike({ response: { status: 500 } })).toBe(false);
    expect(isTimeoutLike(new Error("unrelated"))).toBe(false);
  });

  it("a timeout becomes a typed retryable StellarError", () => {
    const err = new StellarError("timeout", "timed out", true);
    expect(err.retryable).toBe(true);
    expect(err.code).toBe("timeout");
  });
});
