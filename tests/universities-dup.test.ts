import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issue #15 — POST /api/universities upserted on the name-derived id, so
 * a second POST rewrote another user's row. Now conflict returns the
 * existing row untouched. Region derives from country, never hardcoded.
 */

interface Row { id: string; name: string; country: string; city: string | null; created_by?: string }
const customRows: Row[] = [];
const cookieJar = new Map<string, string>();
const liveSessions = new Set<string>();

function sql(strings: TemplateStringsArray, ...params: unknown[]) {
  const text = strings.join("?").toLowerCase();
  if (text.includes("insert into custom_universities")) {
    const [id, name, country, city, created_by] = params as string[];
    if (customRows.some((r) => r.id === id)) return Promise.resolve([]); // do nothing
    customRows.push({ id, name, country, city, created_by });
    return Promise.resolve([{ id, name, country, city }]);
  }
  if (text.includes("select id, name, country, city from custom_universities"))
    return Promise.resolve(customRows.map(({ id, name, country, city }) => ({ id, name, country, city })));
  if (text.includes("select * from users"))
    return Promise.resolve([{ id: params[0], email: "a@b.c", name: "T", avatar_url: null }]);
  if (text.includes("select * from profiles")) return Promise.resolve([]);
  if (text.includes("select skill from user_skills")) return Promise.resolve([]);
  if (text.includes("select distinct provider")) return Promise.resolve([]);
  if (text.includes("select last_seen_at from sessions"))
    return Promise.resolve(liveSessions.size ? [{ last_seen_at: new Date() }] : []);
  if (text.includes("update sessions set last_seen_at")) return Promise.resolve([]);
  return Promise.resolve([]);
}

vi.mock("@/lib/db", () => ({ db: () => sql, databaseConfigured: true }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (cookieJar.has(k) ? { value: cookieJar.get(k) } : undefined),
    set: (k: string, v: string) => cookieJar.set(k, v),
  }),
}));

import { signSession } from "@/lib/session";
import { POST } from "@/app/api/universities/route";

const authed = (body: object) => {
  process.env.AUTH_SECRET = "test-secret";
  liveSessions.add("s1");
  cookieJar.set("earnly_session", signSession("u1", "s1"));
  return new Request("https://earnly.app/api/universities", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://earnly.app" },
    body: JSON.stringify(body),
  });
};
describe("custom universities — no cross-user overwrite", () => {
  beforeEach(() => { customRows.length = 0; cookieJar.clear(); liveSessions.clear(); });

  it("a duplicate POST returns the existing row untouched", async () => {
    const r1 = await (await POST(authed({ name: "Makerere University", country: "Uganda", city: "Kampala" }) as unknown as import("next/server").NextRequest)).json();
    expect(r1.university.id).toBe("c-makerere-university");
    expect(customRows[0].created_by).toBe("u1");

    // Second user, same name — a different session
    cookieJar.clear(); liveSessions.clear();
    liveSessions.add("s2");
    cookieJar.set("earnly_session", signSession("u2", "s2"));
    const r2 = await (await POST(new Request("https://earnly.app/api/universities", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://earnly.app" },
      body: JSON.stringify({ name: "Makerere University", country: "France", city: "Lyon" }),
    }) as unknown as import("next/server").NextRequest)).json();

    // The original row is UNTOUCHED — same owner, same country/city.
    expect(customRows).toHaveLength(1);
    expect(customRows[0].created_by).toBe("u1");
    expect(customRows[0].country).toBe("Uganda");
    expect(r2.university.country).toBe("Uganda");   // the existing row comes back
  });
});

describe("regionForCountry", () => {
  it("maps catalogue + extended countries correctly", async () => {
    const { regionForCountry } = await import("@/lib/universities");
    expect(regionForCountry("Uganda")).toBe("Africa");
    expect(regionForCountry("France")).toBe("Europe");
    expect(regionForCountry("Peru")).toBe("South America");
    expect(regionForCountry("Japan")).toBe("Asia");
    expect(regionForCountry("Fiji")).toBe("Oceania");
  });
});
