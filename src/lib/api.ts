import { NextResponse } from "next/server";

/**
 * The one API error/response contract (issue #12).
 *
 * Every route under /api/** returns the same error shape:
 *   { ok: false, code: string, error: string, retryable: boolean }
 * `error` stays the human-readable field so existing clients keep
 * working; `code` is machine-stable; `retryable` tells callers whether
 * trying again can succeed.
 */
export function errorResponse(
  code: string,
  message: string,
  status = 400,
  retryable = false
): NextResponse {
  return NextResponse.json({ ok: false, code, error: message, retryable }, { status });
}

export function okResponse<T extends object>(payload: T): NextResponse {
  return NextResponse.json({ ok: true, ...payload });
}

/** Reads a JSON body without ever throwing on malformed input. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object") return body as Record<string, unknown>;
  } catch {
    /* fall through to an empty object */
  }
  return {};
}

export function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : "";
}

export function readKey(body: Record<string, unknown>): string | null {
  const raw = body.idempotencyKey;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 120) return null;
  return trimmed;
}
