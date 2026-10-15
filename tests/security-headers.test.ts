import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}
const headerRules = () =>
  (nextConfig.headers as () => Promise<HeaderRule[]>)();

/**
 * Issue #21 — the app shipped zero security headers. The config's
 * headers() section is the contract: every route gets the set.
 */
describe("security headers", () => {
  it("headers() applies a rule covering all routes", async () => {
    const rules = await headerRules();
    expect(rules.some((r) => r.source === "/:path*")).toBe(true);
  });

  it("every required header is present", async () => {
    const rules = await headerRules();
    const all = rules.find((r) => r.source === "/:path*")!.headers;
    const keys = all.map((h) => h.key);
    for (const required of [
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Strict-Transport-Security",
      "Permissions-Policy",
      "Content-Security-Policy",
    ]) {
      expect(keys).toContain(required);
    }
  });

  it("values match the hardened set", async () => {
    const all = (await headerRules())
      .find((r) => r.source === "/:path*")!.headers;
    const byKey = Object.fromEntries(all.map((h) => [h.key, h.value]));
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["Strict-Transport-Security"]).toContain("max-age=63072000");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    const csp = byKey["Content-Security-Policy"];
    for (const directive of [
      "default-src 'self'",
      "font-src 'self'",                    // self-hosted woff2 only
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "connect-src 'self' https://accounts.google.com",
      "form-action 'self' https://accounts.google.com",
    ]) {
      expect(csp).toContain(directive);
    }
    // No header weakens existing behavior: 'unsafe-inline' appears ONLY on
    // script/style (Next SSR + Tailwind require it), never on img/connect.
    expect(csp.match(/unsafe-inline/g)!.length).toBe(2);
  });
});
