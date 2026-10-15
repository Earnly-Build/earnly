import { describe, expect, it } from "vitest";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";

/**
 * Issue #9 — mutating routes trusted SameSite=Lax alone. The shared
 * guard asserts first-party origin across Sec-Fetch-Site, Origin and
 * Referer, with every ambiguous case documented.
 */
const req = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://earnly.app${path}`, { method: "POST", headers });

describe("assertSameOrigin", () => {
  it("same-origin Sec-Fetch-Site passes", () => {
    expect(() => assertSameOrigin(
      req("/api/profile", { "sec-fetch-site": "same-origin" }))).not.toThrow();
  });

  it("user-initiated navigation ('none') passes", () => {
    expect(() => assertSameOrigin(
      req("/api/profile", { "sec-fetch-site": "none" }))).not.toThrow();
  });

  it("cross-site is rejected — the CSRF case", () => {
    expect(() => assertSameOrigin(
      req("/api/profile", { "sec-fetch-site": "cross-site" })))
      .toThrowError(CsrfError);
  });

  it("same-site is rejected — subdomain attacks stay out", () => {
    expect(() => assertSameOrigin(
      req("/api/profile", { "sec-fetch-site": "same-site" })))
      .toThrowError(CsrfError);
  });

  it("matching Origin passes; foreign Origin rejects", () => {
    expect(() => assertSameOrigin(
      req("/api/profile", { origin: "https://earnly.app" }))).not.toThrow();
    expect(() => assertSameOrigin(
      req("/api/profile", { origin: "https://evil.example" })))
      .toThrowError(CsrfError);
  });

  it("Referer fallback works when Origin is absent", () => {
    expect(() => assertSameOrigin(
      req("/api/profile", { referer: "https://earnly.app/app/work" })))
      .not.toThrow();
    expect(() => assertSameOrigin(
      req("/api/profile", { referer: "https://evil.example/phish" })))
      .toThrowError(CsrfError);
  });

  it("missing-everything is allowed (documented: curl + Lax backstop)", () => {
    expect(() => assertSameOrigin(req("/api/profile"))).not.toThrow();
  });
});
