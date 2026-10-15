import { NextResponse, type NextRequest } from "next/server";
import { destroySession } from "@/lib/session";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
  } catch (e) {
    if (e instanceof CsrfError)
      return errorResponse("forbidden", e.message, 403);
    throw e;
  }

  await destroySession();
  return NextResponse.json({ ok: true });
}
