import { describe, expect, it } from "vitest";
import { errorResponse, okResponse } from "@/lib/api";
import { errorResponse as walletErrorResponse } from "@/lib/chain/api";

/**
 * Issue #12 — two error shapes coexisted ({ error } vs the wallet
 * { ok:false, code, error, retryable }). Now one contract everywhere.
 */
describe("the shared error contract", () => {
  it("non-wallet routes emit the unified shape", async () => {
    const res = errorResponse("unauthorized", "Not signed in.", 401);
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body).toEqual({
      ok: false, code: "unauthorized",
      error: "Not signed in.", retryable: false,
    });
  });

  it("wallet routes share the same shape (re-export, not a second impl)", async () => {
    const res = walletErrorResponse("rate_limited", "Slow down.", 429, true);
    const body = await res.json();
    expect(body).toEqual({
      ok: false, code: "rate_limited",
      error: "Slow down.", retryable: true,
    });
  });

  it("ok responses carry ok:true — the two shapes never mix", async () => {
    const res = okResponse({ ping: "pong" });
    const body = await res.json();
    expect(body).toEqual({ ok: true, ping: "pong" });
  });
});
