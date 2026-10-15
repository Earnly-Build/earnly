import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db, type DbProfile, type DbUser } from "./db";

export const SESSION_COOKIE = "earnly_session";
export const MAX_AGE = 60 * 60 * 24 * 30; // 30 days absolute cap
export const IDLE_WINDOW_SECONDS = 60 * 60 * 24 * 7; // 7 days idle timeout
export const THROTTLE_SECONDS = 60; // 1 minute throttle window

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set.");
  return value;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export type SessionTokenPayload = {
  uid: string;
  sid?: string;
  iat: number;
};

export function signSession(userId: string, sid?: string): string {
  const payload: SessionTokenPayload = { uid: userId, iat: Date.now() };
  if (sid) payload.sid = sid;
  const body = b64url(JSON.stringify(payload));
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function parseSessionToken(token: string | undefined): SessionTokenPayload | null {
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
    if (!parsed.uid || !parsed.iat) return null;
    if (Date.now() - parsed.iat > MAX_AGE * 1000) return null;
    return { uid: parsed.uid, sid: parsed.sid, iat: parsed.iat };
  } catch {
    return null;
  }
}

export function readSessionToken(token: string | undefined): string | null {
  return parseSessionToken(token)?.uid ?? null;
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

export interface SessionRow {
  id: string;
  user_id: string;
  created_at: string | Date;
  last_seen_at: string | Date;
  user_agent: string | null;
}

/**
 * Checks if the session row is valid and within the idle window.
 * Advances `last_seen_at` if the elapsed time since last touch exceeds THROTTLE_SECONDS.
 * Deletes the session row and returns false if the session is idle beyond IDLE_WINDOW_SECONDS.
 */
export async function touchSession(userId: string, sid?: string): Promise<boolean> {
  const sql = db();
  let rows: SessionRow[] = [];

  if (sid) {
    rows = (await sql`
      select id, user_id, created_at, last_seen_at, user_agent from sessions
      where id = ${sid} and user_id = ${userId}
      limit 1
    `) as SessionRow[];
  } else {
    rows = (await sql`
      select id, user_id, created_at, last_seen_at, user_agent from sessions
      where user_id = ${userId}
      order by last_seen_at desc
      limit 1
    `) as SessionRow[];
  }

  const sessionRow = rows[0];
  if (!sessionRow) {
    return false;
  }

  const lastSeenMs = new Date(sessionRow.last_seen_at).getTime();
  const now = Date.now();
  const idleMs = now - lastSeenMs;

  // Enforce idle timeout (7 days)
  if (idleMs > IDLE_WINDOW_SECONDS * 1000) {
    await sql`delete from sessions where id = ${sessionRow.id}`;
    return false;
  }

  // Throttle updates: advance last_seen_at at most once per THROTTLE_SECONDS (60s)
  if (idleMs >= THROTTLE_SECONDS * 1000) {
    await sql`update sessions set last_seen_at = now() where id = ${sessionRow.id}`;
  }

  return true;
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const payload = parseSessionToken(token);
  if (!payload) return null;

  const valid = await touchSession(payload.uid, payload.sid);
  if (!valid) return null;

  return loadUser(payload.uid);
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
  const rows = (await sql`
    insert into sessions (user_id, user_agent, last_seen_at) 
    values (${userId}, ${userAgent ?? null}, now())
    returning id
  `) as { id: string }[];
  const sid = rows[0]?.id;
  await sql`update users set last_login_at = now(), updated_at = now() where id = ${userId}`;
  const store = await cookies();
  store.set(SESSION_COOKIE, signSession(userId, sid), cookieOptions);
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const payload = parseSessionToken(token);
  if (payload) {
    const sql = db();
    if (payload.sid) {
      await sql`delete from sessions where id = ${payload.sid}`;
    } else {
      await sql`delete from sessions where user_id = ${payload.uid}`;
    }
  }
  store.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}

export function newId(): string {
  return randomBytes(16).toString("hex");
}
