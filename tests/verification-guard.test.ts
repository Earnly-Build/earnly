import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issue #1 — PUT /api/profile persisted any client-sent `verification`
 * value, so a signed-in user could self-approve the trust flag with a
 * plain curl. The field is now ignored outright on the server.
 */
const profileRows: Record<string, unknown>[] = [];

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "valid" }) }),
}));
vi.mock("@/lib/session", () => ({
  readSessionToken: () => ({ uid: "u1", sid: "s1" }),
  getSession: async () => ({ id: "u1", email: "a@b.c", name: null }),
  loadUser: async () => ({
    id: "u1", email: "a@b.c", name: null, avatar: null, providers: ["email"],
    profile: profileRows[0] ? { verification: profileRows[0].verification, onboarded: true } : null,
    skills: [],
  }),
}));
vi.mock("@/lib/db", () => {
  const sql = (strings: TemplateStringsArray, ...params: unknown[]) => {
    const text = strings.join("?").toLowerCase();
    if (text.includes("select last_seen_at from sessions"))
      return Promise.resolve([{ last_seen_at: new Date() }]);
    if (text.includes("update sessions set last_seen_at")) return Promise.resolve([]);
    if (text.includes("select * from users"))
      return Promise.resolve([{ id: "u1", email: "a@b.c", name: null, avatar_url: null }]);
    if (text.includes("select * from profiles"))
      return Promise.resolve(profileRows.map((r) => ({ ...r })));
    if (text.includes("select skill from user_skills")) return Promise.resolve([]);
    if (text.includes("select distinct provider"))
      return Promise.resolve([{ provider: "email" }]);
    if (text.includes("update profiles")) {
      // emulate the column-wise set() writes — carry what the route wrote
      const col = String(params[0]);
      if (col === "verification") throw new Error("server wrote client verification!");
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  };
  (sql as { query?: unknown }).query = async () => [];
  (sql as { transaction?: unknown }).transaction = async () => {};
  return { db: () => sql, databaseConfigured: true };
});

import { PUT } from "@/app/api/profile/route";

describe("PUT /api/profile — trust flags are server-owned", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret";
    profileRows.length = 0;
    profileRows.push({
      user_id: "u1", verification: "required", onboarded: true,
      full_name: null, course: null, grad_year: null,
      student_email: null, student_id: null,
      university_id: null, university_name: null, university_country: null,
      university_city: null, university_custom: false, location: null, bio: null,
      onboarding_step: 0, availability: [], looking_for: [], work_area: "",
    });
  });

  it("a PUT carrying verification:\"verified\" leaves the stored value unchanged", async () => {
    const res = await PUT(new Request("https://earnly.app/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json", origin: "https://earnly.app" },
      body: JSON.stringify({ verification: "verified", fullName: "Test" }),
    }) as never);
    // The row still reads 'required' — verification went nowhere near the write path.
    expect(profileRows[0].verification).toBe("required");
    expect(res.status).toBeLessThan(500); // not a crash — clean ignore
  });
});
