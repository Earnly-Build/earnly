import { NextResponse } from "next/server";
import { databaseConfigured } from "../db";
import { getSession, type SessionUser } from "../session";
import { walletConfigProblem } from "./provisioning";

// The shared contract lives one level up (no chain deps) — re-exported
// here so every existing wallet-route import keeps working.
export { errorResponse, okResponse, readJson, readString, readKey } from "../api";
import { errorResponse } from "../api";

/**
 * Shared guards for the wallet API. Every wallet route resolves the user from
 * the signed session cookie and works only with that user's rows: no route
 * accepts a user id, address or wallet id from the client.
 */

export type Guarded = { ok: true; user: SessionUser } | { ok: false; response: NextResponse };

export async function requireUser(): Promise<Guarded> {
  if (!databaseConfigured) {
    return { ok: false, response: errorResponse("unavailable", "Accounts are not configured on this deployment yet.", 503) };
  }
  let user: SessionUser | null = null;
  try {
    user = await getSession();
  } catch (error) {
    console.error("[earnly] wallet session lookup failed", (error as Error).message);
    return { ok: false, response: errorResponse("unavailable", "We could not verify your session. Try signing in again.", 503, true) };
  }
  if (!user) {
    return { ok: false, response: errorResponse("unauthorized", "Sign in to use your wallet.", 401) };
  }
  const problem = walletConfigProblem();
  if (problem) {
    return { ok: false, response: errorResponse("unconfigured", problem, 503) };
  }
  return { ok: true, user };
}





