import { beforeEach, describe, expect, it, vi } from "vitest";
import { scrypt as scryptCb, randomBytes } from "node:crypto";
import { promisify } from "node:util";

/**
 * Unit tests for the email-auth logic and validators (issue #11).
 *
 * The real scrypt implementation runs here (offline, no network); only the
 * database accessor is stubbed. The stub inspects the query text so each
 * test can script multi-statement flows (duplicate check → insert, …).
 */

const scrypt = promisify(scryptCb);

const viSqlState = {
  handler: null as null | ((text: string, values: unknown[]) => unknown[]),
};

vi.mock("@/lib/db", () => ({
  databaseConfigured: true,
  db: () => (strings: TemplateStringsArray, ...values: unknown[]) =>
    Promise.resolve(viSqlState.handler!(strings.join(" "), values)),
}));

const { signUpWithEmail, signInWithEmail, cleanEmail, cleanText } = await import("@/lib/auth");

beforeEach(() => {
  viSqlState.handler = () => [];
});

describe("cleanEmail", () => {
  it("trims and lowercases", () => {
    expect(cleanEmail("  Ada@Example.COM ")).toBe("ada@example.com");
  });

  it("rejects non-strings", () => {
    expect(cleanEmail(123)).toBeNull();
    expect(cleanEmail(null)).toBeNull();
    expect(cleanEmail(undefined)).toBeNull();
  });

  it("rejects malformed addresses", () => {
    expect(cleanEmail("plainaddress")).toBeNull();
    expect(cleanEmail("a@b")).toBeNull();
    expect(cleanEmail("a@b.c")).toBeNull(); // TLD too short
    expect(cleanEmail("a @b.co")).toBeNull(); // inner whitespace
    expect(cleanEmail("a@b .co")).toBeNull();
  });

  it("rejects oversized input", () => {
    expect(cleanEmail(`${"a".repeat(250)}@b.co`)).toBeNull(); // 255 chars > 254
    expect(cleanEmail(`${"a".repeat(249)}@b.co`)).not.toBeNull(); // exactly 254 chars
  });
});

describe("cleanText", () => {
  it("collapses whitespace and trims", () => {
    expect(cleanText("  hello   \n world  ")).toBe("hello world");
  });

  it("rejects non-strings and blank input", () => {
    expect(cleanText(42)).toBeNull();
    expect(cleanText(null)).toBeNull();
    expect(cleanText("   ")).toBeNull();
    expect(cleanText("")).toBeNull();
  });

  it("enforces the length cap", () => {
    expect(cleanText("x".repeat(120))).toBe("x".repeat(120));
    expect(cleanText("x".repeat(121))).toBeNull();
    expect(cleanText("x".repeat(11), 10)).toBeNull();
    expect(cleanText("x".repeat(10), 10)).toBe("x".repeat(10));
  });
});

describe("signUpWithEmail", () => {
  it("refuses a duplicate email without hashing", async () => {
    viSqlState.handler = (text) =>
      text.includes("from auth_accounts") ? [{ id: "acc-1" }] : [];
    const result = await signUpWithEmail("ada@example.com", "longenough");
    expect(result).toMatchObject({ ok: false });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already uses/i);
  });

  it("normalizes casing before the duplicate check", async () => {
    const seen: unknown[][] = [];
    viSqlState.handler = (text, values) => {
      if (text.includes("from auth_accounts")) seen.push(values);
      return [];
    };
    // Never completes (no insert rows scripted) — we only assert the lookup.
    await signUpWithEmail("  ALICE@Example.COM ", "longenough").catch(() => {});
    expect(seen[0][0]).toBe("alice@example.com");
  });

  it("creates a new account and returns its id", async () => {
    viSqlState.handler = (text) => {
      if (text.includes("insert into users")) return [{ id: "user-1" }];
      return [];
    };
    const result = await signUpWithEmail("new@example.com", "longenough");
    expect(result).toEqual({ ok: true, userId: "user-1" });
  });
});

describe("signInWithEmail", () => {
  const salt = randomBytes(16).toString("hex");
  let hashHex = "";

  beforeEach(async () => {
    // Same parameters as auth.ts: scrypt(password, salt, 64), default N/r/p.
    hashHex = ((await scrypt("correct-horse", salt, 64)) as Buffer).toString("hex");
    viSqlState.handler = () => [
      { user_id: "user-1", password_hash: hashHex, password_salt: salt },
    ];
  });

  it("rejects an unknown email", async () => {
    viSqlState.handler = () => [];
    const result = await signInWithEmail("nobody@example.com", "whatever123");
    expect(result).toMatchObject({ ok: false });
  });

  it("rejects a wrong password", async () => {
    const result = await signInWithEmail("ada@example.com", "wrong-password");
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toMatch(/matches that email and password/);
  });

  it("accepts the correct password", async () => {
    const result = await signInWithEmail("ada@example.com", "correct-horse");
    expect(result).toEqual({ ok: true, userId: "user-1" });
  });
});
