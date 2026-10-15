import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issue #18 — sign-up leaked account existence: existing emails got a
 * distinct error while new emails succeeded. Now both return the
 * identical body and no session is created on the sign-up path.
 */

const authAccounts: { email: string }[] = [];
const cookieJar = new Map<string, string>();

function sql(strings: TemplateStringsArray, ...params: unknown[]) {
  const text = strings.join("?").toLowerCase();
  if (text.includes("from auth_accounts"))
    return Promise.resolve(authAccounts.filter((a) => a.email === params[0]));
  if (text.includes("select id from users"))
    return Promise.resolve([]);
  if (text.includes("insert into users"))
    return Promise.resolve([{ id: "u-new" }]);
  if (text.includes("insert into profiles") || text.includes("insert into auth_accounts"))
    return Promise.resolve([]);
  return Promise.resolve([]);
}

vi.mock("@/lib/db", () => ({ db: () => sql, databaseConfigured: true }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (cookieJar.has(k) ? { value: cookieJar.get(k) } : undefined),
    set: (k: string, v: string) => cookieJar.set(k, v),
  }),
}));

import { POST } from "@/app/api/auth/email/route";

const signup = (email: string) =>
  POST(new Request("https://earnly.app/api/auth/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://earnly.app" },
    body: JSON.stringify({ mode: "signup", email, password: "password123" }),
  }) as never);

describe("sign-up enumeration oracle closed", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret";
    authAccounts.length = 0;
    cookieJar.clear();
  });

  it("existing vs new email are indistinguishable", async () => {
    authAccounts.push({ email: "taken@uni.edu" });
    const responses = await Promise.all([
      signup("taken@uni.edu"),
      signup("free@uni.edu"),
      signup("also-taken@uni.edu").then(async (r) => r),   // second round
    ]);
    authAccounts.push({ email: "also-taken@uni.edu" });   // it now exists too
    responses[2] = await signup("also-taken@uni.edu");

    const shapes = await Promise.all(responses.map(async (r) => ({
      status: r.status, body: await r.json(),
    })));
    // Every sign-up response is byte-identical in status + keys + values.
    for (const s of shapes) {
      expect(s.status).toBe(200);
      expect(s.body).toEqual({ ok: true, next: "/signin" });
    }
    // No session cookie on ANY of them — signup no longer signs in.
    expect(cookieJar.has("earnly_session")).toBe(false);
  });
});
