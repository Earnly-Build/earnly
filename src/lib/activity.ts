/** Server-side activity repository. Client code imports activity-types only. */
import { db } from "./db";
import { APP_STAGES, type Application, type AppStage, type Notif } from "./types";
import type { ActivityAction, ActivityState } from "./activity-types";

const NOTE_MAX = 500;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/;

export class ActivityError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

function badRequest(): never {
  throw new ActivityError("bad_request", "Invalid activity request.", 400);
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || !ID.test(value)) badRequest();
  return value;
}

function onlyKeys(body: Record<string, unknown>, keys: string[]) {
  if (Object.keys(body).some((key) => !keys.includes(key))) badRequest();
}

/** Accept only a narrow action, never a client user ID or a whole state blob. */
export function parseActivityAction(input: unknown): ActivityAction {
  if (!input || typeof input !== "object" || Array.isArray(input)) badRequest();
  const body = input as Record<string, unknown>;
  switch (body.type) {
    case "apply": {
      onlyKeys(body, ["type", "applicationId", "opportunityId", "note"]);
      if (body.note !== undefined && typeof body.note !== "string") badRequest();
      return {
        type: "apply",
        applicationId: identifier(body.applicationId),
        opportunityId: identifier(body.opportunityId),
        ...(body.note ? { note: (body.note as string).slice(0, NOTE_MAX) } : {}),
      };
    }
    case "advance": {
      onlyKeys(body, ["type", "applicationId", "expectedStage"]);
      if (!APP_STAGES.includes(body.expectedStage as AppStage)) badRequest();
      return {
        type: "advance",
        applicationId: identifier(body.applicationId),
        expectedStage: body.expectedStage as AppStage,
      };
    }
    case "saved": {
      onlyKeys(body, ["type", "opportunityId", "saved"]);
      if (typeof body.saved !== "boolean") badRequest();
      return { type: "saved", opportunityId: identifier(body.opportunityId), saved: body.saved };
    }
    case "read": {
      onlyKeys(body, ["type", "notificationIds"]);
      if (!Array.isArray(body.notificationIds)) badRequest();
      return { type: "read", notificationIds: [...new Set(body.notificationIds.map(identifier))] };
    }
    default:
      return badRequest();
  }
}

type ApplicationRow = {
  id: string;
  opportunity_id: string;
  stage: AppStage;
  note: string | null;
  updated_at: Date | string;
};
type NotificationRow = {
  id: string;
  kind: Notif["kind"];
  title: string;
  body: string;
  created_at: Date | string;
  read_at: Date | string | null;
};

function ageMs(date: Date | string, now: number): number {
  return Math.max(0, now - new Date(date).getTime());
}

function notificationAge(date: Date | string, now: number): string {
  const minutes = Math.floor(ageMs(date, now) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function toActivity(results: unknown[][]): ActivityState {
  const [applications, saved, notifications] = results as [
    ApplicationRow[], { opportunity_id: string }[], NotificationRow[],
  ];
  const now = Date.now();
  return {
    applications: applications.map((row): Application => ({
      id: row.id,
      opportunityId: row.opportunity_id,
      stage: row.stage,
      updatedDaysAgo: Math.floor(ageMs(row.updated_at, now) / 86_400_000),
      ...(row.note ? { note: row.note } : {}),
    })),
    saved: saved.map((row) => row.opportunity_id),
    notifications: notifications.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      ago: notificationAge(row.created_at, now),
      unread: row.read_at === null,
    })),
  };
}

function snapshotQueries(sql: ReturnType<typeof db>, userId: string) {
  return [
    sql`select id, opportunity_id, stage, note, updated_at from applications
        where user_id = ${userId} order by created_at desc, id`,
    sql`select opportunity_id from saved_opportunities
        where user_id = ${userId} order by created_at desc, opportunity_id`,
    sql`select id, kind, title, body, created_at, read_at from notifications
        where user_id = ${userId} order by created_at desc, id`,
  ];
}

export async function loadActivity(userId: string): Promise<ActivityState> {
  const sql = db();
  const rows = await sql.transaction(snapshotQueries(sql, userId), {
    isolationLevel: "RepeatableRead", readOnly: true,
  });
  return toActivity(rows);
}

/** Mutate and read back in one transaction; no local success precedes commit. */
export async function changeActivity(userId: string, action: ActivityAction): Promise<ActivityState> {
  const sql = db();
  let mutation: ReturnType<typeof sql>;
  switch (action.type) {
    case "apply":
      mutation = sql`insert into applications (user_id, id, opportunity_id, note)
        values (${userId}, ${action.applicationId}, ${action.opportunityId}, ${action.note ?? null})
        on conflict (user_id, opportunity_id) do update
          set opportunity_id = excluded.opportunity_id
        returning id`;
      break;
    case "advance":
      mutation = sql`update applications set
          stage = case stage
            when 'Applied' then 'Accepted'
            when 'Accepted' then 'In progress'
            when 'In progress' then 'Submitted'
            when 'Submitted' then 'Completed'
            when 'Completed' then 'Paid'
            else stage end,
          updated_at = case when stage = 'Paid' then updated_at else now() end
        where user_id = ${userId} and id = ${action.applicationId}
          and stage = ${action.expectedStage}
        returning id`;
      break;
    case "saved":
      mutation = action.saved
        ? sql`insert into saved_opportunities (user_id, opportunity_id)
            values (${userId}, ${action.opportunityId})
            on conflict (user_id, opportunity_id) do nothing returning opportunity_id`
        : sql`delete from saved_opportunities
            where user_id = ${userId} and opportunity_id = ${action.opportunityId}
            returning opportunity_id`;
      break;
    case "read":
      mutation = sql`update notifications set read_at = now()
        where user_id = ${userId} and id = any(${action.notificationIds}::text[])
          and read_at is null returning id`;
      break;
  }

  try {
    const [changed, ...rows] = await sql.transaction([mutation, ...snapshotQueries(sql, userId)], {
      isolationLevel: "RepeatableRead",
    });
    const activity = toActivity(rows);
    if (action.type === "advance" && changed.length === 0) {
      if (!activity.applications.some((application) => application.id === action.applicationId)) {
        throw new ActivityError("not_found", "Application not found.", 404);
      }
      throw new ActivityError("conflict", "This application changed. Refresh before advancing it.", 409);
    }
    return activity;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "23505") {
      throw new ActivityError("conflict", "That application ID is already in use.", 409);
    }
    if (code === "40001") {
      throw new ActivityError("conflict", "Activity changed concurrently. Refresh and try again.", 409);
    }
    throw error;
  }
}
