import { type NextRequest } from "next/server";
import { databaseConfigured } from "@/lib/db";
import { getSession } from "@/lib/session";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { errorResponse, okResponse } from "@/lib/api";
import { ActivityError, changeActivity, loadActivity, parseActivityAction } from "@/lib/activity";
import type { ActivityState } from "@/lib/activity-types";

export const dynamic = "force-dynamic";

function activityResponse(activity: ActivityState) {
  const response = okResponse({ activity });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function failed(error: unknown) {
  if (error instanceof ActivityError) {
    return errorResponse(error.code, error.message, error.status);
  }
  console.error("[earnly] activity persistence failed", error);
  return errorResponse("internal", "We could not save activity. Please try again.", 500, true);
}

export async function GET(req: NextRequest) {
  if (!databaseConfigured) return errorResponse("unavailable", "Database is not configured.", 503);
  try {
    const user = await getSession();
    if (!user) return errorResponse("unauthorized", "Not signed in.", 401);
    // This hint never authenticates a request. It prevents a stale tab's
    // activity from crossing accounts when the browser session cookie changes.
    const expectedUser = req?.headers.get("x-earnly-user");
    if (expectedUser !== undefined && expectedUser !== null && expectedUser !== user.id) {
      return errorResponse("account_changed", "Your account changed. Refresh before continuing.", 409);
    }
    return activityResponse(await loadActivity(user.id));
  } catch (error) {
    return failed(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
  } catch (error) {
    if (error instanceof CsrfError) return errorResponse("forbidden", error.message, 403);
    throw error;
  }
  if (!databaseConfigured) return errorResponse("unavailable", "Database is not configured.", 503);
  try {
    const user = await getSession();
    if (!user) return errorResponse("unauthorized", "Not signed in.", 401);
    const expectedUser = req.headers.get("x-earnly-user");
    if (expectedUser !== null && expectedUser !== user.id) {
      return errorResponse("account_changed", "Your account changed. Refresh before continuing.", 409);
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("bad_request", "Malformed request.", 400);
    }
    const action = parseActivityAction(body);
    return activityResponse(await changeActivity(user.id, action));
  } catch (error) {
    return failed(error);
  }
}
