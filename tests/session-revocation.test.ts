import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issue #8 — sign-out only expired the cookie; the HMAC token stayed
 * valid until MAX_AGE because nothing checked the sessions row. Now the
 * token carries the session's row id, getSession verifies the row
 * exists, and destroySession deletes it. Replaying a signed-out cookie
 * must fail — that's the pinned case.
 */

// Minimal pg-tag shim: tag calls carry (strings, ...params) → we assert
// on the SQL text and apply the param behaviors we care about.
const sessionsRows: { id: string; user_id: string }[] = [];
let seq = 0;
const cookieJar = new Map<string, string>();

function sql(strings: TemplateStringsArray, ...params: unknown[]) {
  const text = strings.join("?").toLowerCase();
  if (text.includes("insert into sessions")) {
    const row = { id: `s${++seq}`, user_id: params[0] as string };
    sessionsRows.push(row);
    return Promise.resolve([row]);
  }
  if (text.includes("select 1 from sessions")) {
    const live = sessionsRows.find((r) => r.id === params[0]);
    return Promise.resolve(live ? [{ "?column?": 1 }] : []);
  }
  if (text.includes("delete from sessions where id")) {
    const i = sessionsRows.findIndex((r) => r.id === params[0]);
    if (i >= 0) sessionsRows.splice(i, 1);
    return Promise.resolve([]);
  }
  if (text.includes("delete from sessions where created_at")) {
    return Promise.resolve([]);      // sweep — nothing to assert here
  }
  if (text.includes("update users set last_login_at")) return Promise.resolve([]);
  if (text.includes("select * from users where id"))
    return Promise.resolve([{ id: params[0], email: "a@b.c", name: "T", avatar_url: null }]);
  if (text.includes("select * from profiles"))
    return Promise.resolve([]);
  if (text.includes("select skill from user_skills")) return Promise.resolve([]);
  if (text.includes("select distinct provider from auth_accounts")) return Promise.resolve([]);
  return Promise.resolve([]);
}

vi.mock("@/lib/db", () => ({ db: () => sql }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (cookieJar.has(k) ? { value: cookieJar.get(k) } : undefined),
    set: (k: string, v: string, o?: { maxAge?: number }) => {
      if (o?.maxAge === 0) cookieJar.delete(k); else cookieJar.set(k, v);
    },
  }),
}));

import { createSession, destroySession, getSession, SESSION_COOKIE } from "@/lib/session";

describe("session revocation", () => {
  beforeEach(() => {
    sessionsRows.length = 0;
    seq = 0;
    cookieJar.clear();
    process.env.AUTH_SECRET = "test-secret";
  });

  it("sign in → sign out → replayed cookie is rejected", async () => {
    await createSession("u1", "test-agent");
    const cookie = cookieJar.get(SESSION_COOKIE)!;
    expect(cookie).toBeTruthy();
    expect(sessionsRows).toHaveLength(1);
    expect(await getSession()).not.toBeNull();          // live session reads

    await destroySession();                             // sign out
    expect(sessionsRows).toHaveLength(0);               // row deleted
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);

    cookieJar.set(SESSION_COOKIE, cookie);              // replay the stolen cookie
    expect(await getSession()).toBeNull();              // row gone → rejected
  });

  it("one sign-out leaves the user's other sessions live", async () => {
    await createSession("u1", "device-A");
    const cookieA = cookieJar.get(SESSION_COOKIE)!;
    cookieJar.clear();
    await createSession("u1", "device-B");              // second session
    const cookieB = cookieJar.get(SESSION_COOKIE)!;
    expect(sessionsRows).toHaveLength(2);
    expect(cookieA).not.toBe(cookieB);

    await destroySession();                             // sign out of B
    cookieJar.set(SESSION_COOKIE, cookieA);             // A's cookie still works
    expect(await getSession()).not.toBeNull();
  });
});
