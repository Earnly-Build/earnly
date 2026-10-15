import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db } from "./db";

const scrypt = promisify(scryptCb);

/* ------------------------------------------------------------------ config */

export const googleConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** The public origin used to build OAuth callback URLs. */
export function appOrigin(fallback?: string): string {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (fallback) return fallback.replace(/\/$/, "");
  return "http://localhost:3000";
}

export const googleCallbackPath = "/api/auth/google/callback";

export function googleRedirectUri(origin: string): string {
  return `${appOrigin(origin)}${googleCallbackPath}`;
}

/* -------------------------------------------------------------------- PKCE */

export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function googleAuthUrl(opts: { redirectUri: string; state: string; challenge: string }): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID as string,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/* ------------------------------------------------------------------ Google */

export interface GoogleIdentity {
  sub: string;
  email: string | null;
  email_verified: boolean;
  name: string | null;
  picture: string | null;
}

export async function exchangeGoogleCode(code: string, verifier: string, redirectUri: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID as string,
      client_secret: process.env.GOOGLE_CLIENT_SECRET as string,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed (${res.status}). ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as { access_token: string; id_token?: string };
}

/** Reads the identity from Google itself rather than trusting the client. */
export async function googleIdentity(accessToken: string): Promise<GoogleIdentity> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google userinfo failed (${res.status}).`);
  const data = (await res.json()) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  return {
    sub: data.sub,
    email: data.email?.toLowerCase() ?? null,
    email_verified: Boolean(data.email_verified),
    name: data.name ?? null,
    picture: data.picture ?? null,
  };
}

/* ------------------------------------------------------------------- users */

/**
 * One Earnly account per person. A Google identity is matched by its `sub`
 * first and by email second, so signing in with Google after signing up with
 * email (or signing in twice) never creates a second account.
 */
export async function upsertGoogleUser(identity: GoogleIdentity): Promise<string> {
  const sql = db();
  const linked = (await sql`
    select user_id from auth_accounts
    where provider = 'google' and provider_account_id = ${identity.sub} limit 1
  `) as { user_id: string }[];
  if (linked[0]) {
    if (identity.name || identity.picture) {
      await sql`
        update users set name = coalesce(${identity.name}, name),
                         avatar_url = coalesce(${identity.picture}, avatar_url),
                         updated_at = now()
        where id = ${linked[0].user_id}
      `;
    }
    return linked[0].user_id;
  }

  let userId: string | null = null;
  if (identity.email) {
    const byEmail = (await sql`
      select id from users where lower(email) = ${identity.email} limit 1
    `) as { id: string }[];
    if (byEmail[0]) userId = byEmail[0].id;
  }

  if (!userId) {
    const created = (await sql`
      insert into users (email, email_verified, name, avatar_url)
      values (${identity.email}, ${identity.email_verified}, ${identity.name}, ${identity.picture})
      on conflict (email) do update set updated_at = now()
      returning id
    `) as { id: string }[];
    userId = created[0].id;
    await sql`
      insert into profiles (user_id, full_name, university_custom)
      values (${userId}, ${identity.name}, false)
      on conflict (user_id) do nothing
    `;
  }

  await sql`
    insert into auth_accounts (user_id, provider, provider_account_id, provider_email)
    values (${userId}, 'google', ${identity.sub}, ${identity.email})
    on conflict (provider, provider_account_id) do nothing
  `;
  return userId;
}

/* ------------------------------------------------------------- email auth */

async function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return { salt, hash: derived.toString("hex") };
}

export async function signUpWithEmail(rawEmail: string, password: string): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const sql = db();
  const email = rawEmail.trim().toLowerCase();
  const existing = (await sql`
    select a.id from auth_accounts a
    where a.provider = 'email' and a.provider_account_id = ${email} limit 1
  `) as { id: string }[];
  // Enumeration-safe (issue #18): an existing email returns the same
  // success shape as a fresh signup — no session, no user payload, and
  // the hash still runs so timing doesn't leak either. The route turns
  // this ok into the uniform "check your email"-style body.
  if (existing[0]) {
    await hashPassword(password);           // equalize the work path
    return { ok: true, userId: "" };
  }

  const { salt, hash } = await hashPassword(password);
  let userId: string;
  const users = (await sql`select id from users where lower(email) = ${email} limit 1`) as { id: string }[];
  if (users[0]) {
    userId = users[0].id;
  } else {
    const created = (await sql`
      insert into users (email, email_verified) values (${email}, false) returning id
    `) as { id: string }[];
    userId = created[0].id;
    await sql`insert into profiles (user_id) values (${userId}) on conflict (user_id) do nothing`;
  }
  await sql`
    insert into auth_accounts (user_id, provider, provider_account_id, provider_email, password_hash, password_salt)
    values (${userId}, 'email', ${email}, ${email}, ${hash}, ${salt})
    on conflict (provider, provider_account_id) do update
      set password_hash = excluded.password_hash, password_salt = excluded.password_salt
  `;
  return { ok: true, userId };
}

export async function signInWithEmail(rawEmail: string, password: string): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const sql = db();
  const email = rawEmail.trim().toLowerCase();
  const rows = (await sql`
    select user_id, password_hash, password_salt from auth_accounts
    where provider = 'email' and provider_account_id = ${email} limit 1
  `) as { user_id: string; password_hash: string | null; password_salt: string | null }[];
  const row = rows[0];
  if (!row || !row.password_hash || !row.password_salt) {
    // Timing-equalized miss (issue #7): unknown emails still pay the
    // scrypt cost so response time can't reveal existence.
    const dummy = await hashPassword(password, "00000000000000000000000000000000");
    void dummy;
    return { ok: false, error: "No Earnly account matches that email and password." };
  }
  const derived = (await scrypt(password, row.password_salt, 64)) as Buffer;
  const expected = Buffer.from(row.password_hash, "hex");
  if (derived.length !== expected.length || !timingSafeEqual(derived, expected)) {
    return { ok: false, error: "No Earnly account matches that email and password." };
  }
  return { ok: true, userId: row.user_id };
}

/* ----------------------------------------------------------- validation */

export function cleanEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254 ? email : null;
}

export function cleanText(value: unknown, max = 120): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length > max) return null;
  return text;
}
