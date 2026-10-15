import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Contract tests for the email-auth and profile API routes (issue #11).
 *
 * House pattern (see tests/api-auth.test.ts): mock `@/lib/db` and
 * `@/lib/session`, drive real `Request` objects at the route handlers,
 * stay fully offline. The auth *logic* (scrypt, duplicate detection) is
 * covered at the lib level in tests/auth-lib.test.ts; here the HTTP
 * contract is asserted: status codes, session handling, and that validated
 * patches reach the database layer.
 */

const viDbState = {
  configured: true,
  sql: null as unknown as ReturnType<typeof makeRouteSql>,
};

function makeRouteSql() {
  const query = vi.fn(async () => []);
  const tag = Object.assign(vi.fn(async () => []), { query });
  return tag;
}

vi.mock("@/lib/db", () => ({
  get databaseConfigured() {
    return viDbState.configured;
  },
  db: () => viDbState.sql,
}));

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
  loadUser: vi.fn(),
  createSession: vi.fn(),
}));

// Keep the pure validators real; only the DB-backed functions are stubbed.
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, signUpWithEmail: vi.fn(), signInWithEmail: vi.fn() };
});

vi.mock("@/lib/chain/provisioning", () => ({ provisionAfterSignIn: vi.fn() }));

const { getSession, loadUser, createSession } = await import("@/lib/session");
const { signUpWithEmail, signInWithEmail } = await import("@/lib/auth");
const { provisionAfterSignIn } = await import("@/lib/chain/provisioning");
const emailRoute = await import("@/app/api/auth/email/route");
const profileRoute = await import("@/app/api/profile/route");

const SESSION_USER = {
  id: "user-1",
  email: "ada@example.com",
  name: "Ada",
  avatar: null,
  profile: null,
  skills: [],
  providers: ["email"],
};

function jsonReq(url: string, method: string, body?: unknown, rawBody?: string): NextRequest {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  viDbState.configured = true;
  viDbState.sql = makeRouteSql();
  vi.mocked(getSession).mockReset().mockResolvedValue(null);
  vi.mocked(loadUser).mockReset().mockResolvedValue(SESSION_USER);
  vi.mocked(createSession).mockReset().mockResolvedValue(undefined);
  vi.mocked(signUpWithEmail).mockReset();
  vi.mocked(signInWithEmail).mockReset();
  vi.mocked(provisionAfterSignIn).mockReset().mockResolvedValue(undefined);
});

describe("POST /api/auth/email", () => {
  const url = "https://earnly.test/api/auth/email";

  it("returns 503 when the database is not configured", async () => {
    viDbState.configured = false;
    const response = await emailRoute.POST(
      jsonReq(url, "POST", { email: "a@b.co", password: "longenough" })
    );
    expect(response.status).toBe(503);
    expect(signUpWithEmail).not.toHaveBeenCalled();
  });

  it("rejects a malformed JSON body with 400", async () => {
    const response = await emailRoute.POST(jsonReq(url, "POST", undefined, "{nope"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Malformed request." });
  });

  it("rejects an invalid email with 400", async () => {
    const response = await emailRoute.POST(
      jsonReq(url, "POST", { email: "not-an-email", password: "longenough" })
    );
    expect(response.status).toBe(400);
    expect(signUpWithEmail).not.toHaveBeenCalled();
  });

  it("rejects a short password with 400", async () => {
    const response = await emailRoute.POST(
      jsonReq(url, "POST", { email: "ada@example.com", password: "short" })
    );
    expect(response.status).toBe(400);
    expect(signUpWithEmail).not.toHaveBeenCalled();
  });

  it("returns 401 when sign-up hits a duplicate email", async () => {
    vi.mocked(signUpWithEmail).mockResolvedValue({
      ok: false,
      error: "An Earnly account already uses this email. Sign in instead.",
    });
    const response = await emailRoute.POST(
      jsonReq(url, "POST", { email: "ada@example.com", password: "longenough" })
    );
    expect(response.status).toBe(401);
    expect(createSession).not.toHaveBeenCalled();
    expect(provisionAfterSignIn).not.toHaveBeenCalled();
  });

  it("returns 401 on a wrong-password sign-in", async () => {
    vi.mocked(signInWithEmail).mockResolvedValue({
      ok: false,
      error: "No Earnly account matches that email and password.",
    });
    const response = await emailRoute.POST(
      jsonReq(url, "POST", { mode: "signin", email: "ada@example.com", password: "wrongpass1" })
    );
    expect(response.status).toBe(401);
    expect(signInWithEmail).toHaveBeenCalledWith("ada@example.com", "wrongpass1");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("creates a session and provisions on success", async () => {
    vi.mocked(signUpWithEmail).mockResolvedValue({ ok: true, userId: "user-1" });
    const response = await emailRoute.POST(
      jsonReq(url, "POST", { email: "ada@example.com", password: "longenough" })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createSession).mock.calls[0][0]).toBe("user-1");
    expect(provisionAfterSignIn).toHaveBeenCalledWith("user-1");
  });
});

describe("profile route authorization", () => {
  const url = "https://earnly.test/api/profile";

  it("refuses GET without a session (401)", async () => {
    const response = await profileRoute.GET();
    expect(response.status).toBe(401);
  });

  it("returns the session user on GET", async () => {
    vi.mocked(getSession).mockResolvedValue(SESSION_USER);
    const response = await profileRoute.GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ user: { id: "user-1" } });
  });

  it("refuses PUT without a session (401)", async () => {
    const response = await profileRoute.PUT(jsonReq(url, "PUT", { fullName: "Ada" }));
    expect(response.status).toBe(401);
    expect(viDbState.sql.query).not.toHaveBeenCalled();
  });

  it("returns 503 on PUT when the database is not configured", async () => {
    viDbState.configured = false;
    vi.mocked(getSession).mockResolvedValue(SESSION_USER);
    const response = await profileRoute.PUT(jsonReq(url, "PUT", { fullName: "Ada" }));
    expect(response.status).toBe(503);
  });

  it("rejects a malformed JSON body on PUT with 400", async () => {
    vi.mocked(getSession).mockResolvedValue(SESSION_USER);
    const response = await profileRoute.PUT(jsonReq(url, "PUT", undefined, "{nope"));
    expect(response.status).toBe(400);
  });

  it("persists a validated patch for the session user", async () => {
    vi.mocked(getSession).mockResolvedValue(SESSION_USER);
    const response = await profileRoute.PUT(
      jsonReq(url, "PUT", { fullName: "  Ada  Lovelace ", bio: "Builder" })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    const query = viDbState.sql.query;
    expect(query).toHaveBeenCalledTimes(1);
    const [text, values] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(text).toMatch(/update profiles set/);
    expect(text).toContain("full_name");
    // cleanText collapses/trims whitespace server-side.
    expect(values).toContain("Ada Lovelace");
    expect(values).toContain("Builder");
    // The patch is bound to the session user, never a client-sent id.
    expect(values[values.length - 1]).toBe("user-1");
  });

  it("exercises list inputs through the skills path", async () => {
    vi.mocked(getSession).mockResolvedValue(SESSION_USER);
    const response = await profileRoute.PUT(
      jsonReq(url, "PUT", {
        availability: [" Weekends ", "", 42, "Weekends"],
        skills: ["Python", "python"],
      })
    );
    expect(response.status).toBe(200);
    const [text, values] = viDbState.sql.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(text).toMatch(/update profiles set/);
    // stringList trims, drops empties/non-strings and dedupes.
    expect(values).toContain(JSON.stringify(["Weekends"]));
  });
});
