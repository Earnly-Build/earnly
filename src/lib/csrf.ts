/**
 * Same-origin enforcement for state-changing routes (issue #9).
 *
 * SameSite=Lax leaves gaps — same-site subdomain attacks, top-level GET
 * navigations, older clients — so mutating routes assert the request is
 * first-party instead of trusting the cookie attribute alone.
 *
 * Signals, strongest first:
 *   - Sec-Fetch-Site: 'same-origin' or 'none' (user-initiated nav) → pass.
 *     'same-site' is REJECTED — a subdomain can be attacker-controlled.
 *   - Origin / Referer: host must equal the request's host.
 *   - All three absent → allowed (documented): non-browser clients (curl,
 *     mobile) send none; SameSite=Lax is the backstop for cookie POSTs.
 */

export class CsrfError extends Error {
  readonly status = 403;
  constructor() {
    super("Cross-site request rejected");
  }
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/** Throws CsrfError (403) when the request is provably foreign. */
export function assertSameOrigin(req: Request): void {
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return;
  if (site === "same-site" || site === "cross-site") throw new CsrfError();

  const host = hostOf(req.url);
  for (const header of ["origin", "referer"]) {
    const src = req.headers.get(header);
    if (!src) continue;
    if (hostOf(src) === host) return;
    throw new CsrfError();
  }
  // No signal at all — allowed (documented choice above).
}
