import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db, type DbProfile, type DbUser } from "./db";

export const SESSION_COOKIE = "earnly_session";
const MAX_AGE = 60 * 60 * 24 * 30;

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set.");
  return value;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signSession(userId: string, sessionId: string): string {
  const body = b64url(JSON.stringify({ uid: userId, sid: sessionId, iat: Date.now() }));
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readSessionToken(
  token: string | undefined,
): { uid: string; sid: string } | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      uid?: string;
      sid?: string;
      iat?: number;
    };
    // Tokens minted before sid existed can't be revoked — rejected
    // rather than carried (a forced re-login beats an unkillable session).
    if (!parsed.uid || !parsed.sid || !parsed.iat) return null;
    if (Date.now() - parsed.iat > MAX_AGE * 1000) return null;
    return { uid: parsed.uid, sid: parsed.sid };
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};

export type SessionUser = {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  profile: DbProfile | null;
  skills: string[];
  providers: string[];
};

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!token) return null;
  const sql = db();
  // The row IS the session — gone (revoked/expired-swept) means the
  // token is dead even though its MAC still verifies.
  const live = (await sql`select 1 from sessions where id = ${token.sid} limit 1`);
  if (!live[0]) return null;
  return loadUser(token.uid);
}

export async function loadUser(userId: string): Promise<SessionUser | null> {
  const sql = db();
  const users = (await sql`select * from users where id = ${userId} limit 1`) as DbUser[];
  const user = users[0];
  if (!user) return null;
  const profiles = (await sql`select * from profiles where user_id = ${userId} limit 1`) as DbProfile[];
  const skills = (await sql`select skill from user_skills where user_id = ${userId} order by created_at`) as {
    skill: string;
  }[];
  const providers = (
    await sql`select distinct provider from auth_accounts where user_id = ${userId}`
  ) as { provider: string }[];
  return {
    id: user.id,
    email: user.email,
    name: profiles[0]?.full_name || user.name,
    avatar: user.avatar_url,
    profile: profiles[0] ?? null,
    skills: skills.map((s) => s.skill),
    providers: providers.map((p) => p.provider),
  };
}

export async function createSession(userId: string, userAgent?: string | null) {
  const sql = db();
  const rows = (await sql`insert into sessions (user_id, user_agent)
    values (${userId}, ${userAgent ?? null}) returning id`) as { id: string }[];
  await sql`update users set last_login_at = now(), updated_at = now() where id = ${userId}`;
  const store = await cookies();
  store.set(SESSION_COOKIE, signSession(userId, rows[0].id), cookieOptions);
}

export async function destroySession() {
  const store = await cookies();
  const token = readSessionToken(store.get(SESSION_COOKIE)?.value);
  const sql = db();
  if (token) {
    // Revoke THIS session only — other devices' sessions for the same
    // user are untouched (the issue documents one-sign-out ≠ global).
    await sql`delete from sessions where id = ${token.sid}`;
  }
  // Opportunistic sweep: rows older than MAX_AGE are dead anyway —
  // delete them on sign-out so the table doesn't grow forever.
  await sql`delete from sessions where created_at < now() - interval '30 days'`;
  store.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}

export function newId(): string {
  return randomBytes(16).toString("hex");
}
