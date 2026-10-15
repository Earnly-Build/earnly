import { NextResponse, type NextRequest } from "next/server";
import { cleanEmail, cleanText } from "@/lib/auth";
import { db, databaseConfigured } from "@/lib/db";
import { getSession, loadUser } from "@/lib/session";
import { ALL_SKILLS, MAX_SKILLS, mergeSkills } from "@/lib/skills";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { errorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";


function stringList(value: unknown, max: number, itemMax = 40): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value.slice(0, max)) {
    if (typeof item !== "string") continue;
    const text = item.replace(/\s+/g, " ").trim().slice(0, itemMax);
    if (text) out.push(text);
  }
  return [...new Set(out)];
}

export async function GET() {
  const user = await getSession();
  if (!user) return errorResponse("unauthorized", "Not signed in.", 401);
  return NextResponse.json({ user });
}

/**
 * Persists onboarding, profile and preference edits.
 * Everything is validated server-side; nothing is trusted from the browser.
 */
export async function PUT(req: NextRequest) {
  try {
    assertSameOrigin(req);
  } catch (e) {
    if (e instanceof CsrfError)
      return errorResponse("forbidden", e.message, 403);
    throw e;
  }

  if (!databaseConfigured) {
    return errorResponse("unavailable", "Database is not configured.", 503);
  }
  const session = await getSession();
  if (!session) return errorResponse("unauthorized", "Not signed in.", 401);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse("bad_request", "Malformed request.", 400);
  }

  const patch: Record<string, unknown> = {};
  const set = (column: string, value: unknown) => {
    if (value !== undefined) patch[column] = value;
  };

  set("full_name", cleanText(body.fullName, 120));
  set("course", cleanText(body.course, 120));
  set("location", cleanText(body.location, 120));
  set("bio", cleanText(body.bio, 600));
  set("student_id", cleanText(body.studentId, 60));

  const studentEmail = cleanEmail(body.studentEmail);
  if (studentEmail) set("student_email", studentEmail);

  if (body.gradYear !== undefined) {
    const year = Number(body.gradYear);
    if (Number.isInteger(year) && year >= 1950 && year <= 2045) set("grad_year", year);
  }

  // `verification` is deliberately not writable here (issue #1): the
  // trust flag only ever changes through the server-side verification
  // workflow — a client-sent value is ignored outright.

  if (body.onboarded !== undefined) set("onboarded", Boolean(body.onboarded));

  if (body.onboardingStep !== undefined) {
    const step = Number(body.onboardingStep);
    if (Number.isInteger(step) && step >= 0 && step <= 20) set("onboarding_step", step);
  }

  const availability = stringList(body.availability, 12, 40);
  if (availability) set("availability", JSON.stringify(availability));

  const lookingFor = stringList(body.lookingFor, 12, 40);
  if (lookingFor) set("looking_for", JSON.stringify(lookingFor));

  const workArea = cleanText(body.workArea, 40);
  if (workArea) set("work_area", workArea);

  if (body.aiPrefs && typeof body.aiPrefs === "object") {
    const serialized = JSON.stringify(body.aiPrefs);
    if (serialized.length <= 8000) set("ai_prefs", serialized);
  }

  const university = body.university as
    | { id?: unknown; name?: unknown; country?: unknown; city?: unknown; custom?: unknown }
    | undefined;
  if (university) {
    const name = cleanText(university.name, 160);
    const country = cleanText(university.country, 80);
    if (!name || !country) {
      return errorResponse("bad_request", "A university needs a name and a country.", 400);
    }
    set("university_id", cleanText(university.id, 200) ?? `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`);
    set("university_name", name);
    set("university_country", country);
    set("university_city", cleanText(university.city, 80));
    set("university_custom", Boolean(university.custom));
  }

  const sql = db();
  try {
    const JSON_COLUMNS = new Set(["availability", "looking_for", "ai_prefs"]);
    const columns = Object.keys(patch);
    if (columns.length) {
      const assignments = columns
        .map((c, i) => `${c} = $${i + 1}${JSON_COLUMNS.has(c) ? "::jsonb" : ""}`)
        .join(", ");
      const values = columns.map((c) => (JSON_COLUMNS.has(c) ? (patch[c] as string) : patch[c]));
      await sql.query(`update profiles set ${assignments}, updated_at = now() where user_id = $${columns.length + 1}`, [
        ...values,
        session.id,
      ]);
    }

    if (body.skills !== undefined && Array.isArray(body.skills)) {
      const existing = (await sql`select skill from user_skills where user_id = ${session.id}`) as {
        skill: string;
      }[];
      // The browser sends the full desired set, so this is a replace, not a merge.
      const desired = mergeSkills([], body.skills as string[]).slice(0, MAX_SKILLS);
      const wanted = new Map(desired.map((s) => [s.toLowerCase(), s]));
      const known = new Set(existing.map((s) => s.skill.toLowerCase()));
      const additions = [...wanted.entries()]
        .filter(([key]) => !known.has(key))
        .map(([, skill]) => skill);
      // Set-based sync inside one transaction — ≤3 statements regardless
      // of how many skills changed, all-or-nothing (issue #22).
      // Case-insensitive matching preserved via lower() comparisons.
      const sync = [
        sql`delete from user_skills
            where user_id = ${session.id}
            and lower(skill) <> all(${desired.map((s) => s.toLowerCase())}::text[])`,
      ];
      if (additions.length) {
        sync.push(sql`
          insert into user_skills (user_id, skill, custom)
          select ${session.id}, s, not (s = any(${ALL_SKILLS}::text[]))
          from unnest(${additions}::text[]) s
          on conflict (user_id, skill) do nothing
        `);
      }
      await sql.transaction(sync);
    }

    const user = await loadUser(session.id);
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error("[earnly] profile update failed", error);
    return errorResponse("internal", "We could not save that. Please try again.", 500);
  }
}
