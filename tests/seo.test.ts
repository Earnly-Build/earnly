import { afterEach, beforeEach, describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("robots.ts crawler policy", () => {
  const originalEnv = process.env.APP_URL;

  beforeEach(() => {
    delete process.env.APP_URL;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.APP_URL = originalEnv;
    } else {
      delete process.env.APP_URL;
    }
  });

  it("configures user-agent wildcards and allows public browsing", () => {
    const res = robots();
    const rules = Array.isArray(res.rules) ? res.rules[0] : res.rules;
    expect(rules.userAgent).toBe("*");
    expect(rules.allow).toBe("/");
  });

  it("disallows authenticated areas, APIs, and onboarding/auth flows", () => {
    const res = robots();
    const rules = Array.isArray(res.rules) ? res.rules[0] : res.rules;
    const disallow = Array.isArray(rules.disallow) ? rules.disallow : [rules.disallow];

    expect(disallow).toContain("/app/");
    expect(disallow).toContain("/api/");
    expect(disallow).toContain("/signin");
    expect(disallow).toContain("/verify");
    expect(disallow).toContain("/onboarding");
  });

  it("points to the sitemap with default fallback origin", () => {
    const res = robots();
    expect(res.sitemap).toBe("https://earnly.vercel.app/sitemap.xml");
  });

  it("points to the sitemap with custom APP_URL when configured", () => {
    process.env.APP_URL = "https://example.com";
    const res = robots();
    expect(res.sitemap).toBe("https://example.com/sitemap.xml");
  });
});

describe("sitemap.ts public routes index", () => {
  const originalEnv = process.env.APP_URL;

  beforeEach(() => {
    delete process.env.APP_URL;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.APP_URL = originalEnv;
    } else {
      delete process.env.APP_URL;
    }
  });

  it("lists all public content and marketing routes", () => {
    const entries = sitemap();
    const urls = entries.map((e) => e.url);

    expect(urls).toEqual([
      "https://earnly.vercel.app",
      "https://earnly.vercel.app/about",
      "https://earnly.vercel.app/contact",
      "https://earnly.vercel.app/privacy",
      "https://earnly.vercel.app/terms",
    ]);
  });

  it("does not include protected, private, or api routes", () => {
    const entries = sitemap();
    const urls = entries.map((e) => e.url);

    for (const forbidden of ["/app", "/api", "/signin", "/verify", "/onboarding"]) {
      expect(urls.some((u) => u.includes(forbidden))).toBe(false);
    }
  });

  it("provides valid lastModified dates and priorities", () => {
    const entries = sitemap();
    for (const entry of entries) {
      expect(entry.lastModified).toBeInstanceOf(Date);
      expect(typeof entry.priority).toBe("number");
      expect(entry.priority).toBeGreaterThan(0);
      expect(entry.priority).toBeLessThanOrEqual(1);
    }
  });

  it("derives absolute URLs from APP_URL when configured", () => {
    process.env.APP_URL = "https://custom-earnly.org";
    const entries = sitemap();
    expect(entries[0].url).toBe("https://custom-earnly.org");
    expect(entries[1].url).toBe("https://custom-earnly.org/about");
  });
});
