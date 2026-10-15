import { APP_STAGES } from "./types";
import type { AiPrefs, Application, Notif, VerificationState } from "./types";

export interface Persisted {
  signedIn: boolean;
  authMethod: "google" | "email" | null;
  verification: VerificationState;
  onboarded: boolean;
  prefs: AiPrefs;
  aiPrefs: AiPrefs;
  saved: string[];
  applications: Application[];
  notifications: Notif[];
  theme: "dark" | "light";
}

export const PERSISTED_VERSION = 1;
const FIELDS = ["signedIn", "authMethod", "verification", "onboarded", "prefs",
  "aiPrefs", "saved", "applications", "notifications", "theme"] as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function oneOf(value: unknown, choices: readonly string[]): boolean {
  return typeof value === "string" && choices.includes(value);
}

function validPrefs(value: unknown): value is AiPrefs {
  return record(value) && strings(value.skills) && strings(value.kinds) &&
    strings(value.tasks) && strings(value.availability) && typeof value.radius === "string" &&
    typeof value.minPay === "number" && Number.isFinite(value.minPay) && value.minPay >= 0 &&
    oneOf(value.payType, ["any", "hourly", "fixed"]);
}

function validState(value: unknown): value is Persisted {
  return record(value) && typeof value.signedIn === "boolean" &&
    (value.authMethod === null || oneOf(value.authMethod, ["google", "email"])) &&
    oneOf(value.verification, ["required", "pending", "verified", "failed"]) &&
    typeof value.onboarded === "boolean" && oneOf(value.theme, ["dark", "light"]) &&
    validPrefs(value.prefs) && validPrefs(value.aiPrefs) && strings(value.saved) &&
    Array.isArray(value.applications) && value.applications.every((a) =>
      record(a) && typeof a.id === "string" && typeof a.opportunityId === "string" &&
      oneOf(a.stage, APP_STAGES) && typeof a.updatedDaysAgo === "number" &&
      Number.isFinite(a.updatedDaysAgo) &&
      (a.demoEscrow === undefined || typeof a.demoEscrow === "boolean")) &&
    Array.isArray(value.notifications) && value.notifications.every((n) =>
      record(n) && typeof n.id === "string" && typeof n.title === "string" &&
      typeof n.body === "string" && typeof n.ago === "string" && typeof n.unread === "boolean" &&
      oneOf(n.kind, ["application", "match", "payment", "deadline", "review", "verification", "ai"]));
}

/** Persist only the declared slice, never version markers or obsolete root fields. */
function knownFields(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(FIELDS.filter((key) => Object.hasOwn(value, key))
    .map((key) => [key, value[key]]));
}

/** Missing/corrupt/unsupported data always starts fresh, without partial application. */
export function loadPersisted(raw: string | null, defaults: Persisted): Persisted {
  if (!raw) return defaults;
  try {
    const payload: unknown = JSON.parse(raw);
    if (!record(payload)) return defaults;
    let data: unknown;
    if (!Object.hasOwn(payload, "v")) {
      // v0: the original unversioned flat store. Missing fields keep their defaults.
      data = { ...defaults, ...knownFields(payload) };
    } else if (payload.v === 0 && record(payload.data)) {
      // Explicit v0 envelopes use the same migration as the legacy flat store.
      data = { ...defaults, ...knownFields(payload.data) };
    } else if (payload.v === PERSISTED_VERSION) {
      data = payload.data;
    } else {
      return defaults;
    }
    if (!validState(data)) return defaults;
    return knownFields(data as unknown as Record<string, unknown>) as unknown as Persisted;
  } catch {
    return defaults;
  }
}

export function serializePersisted(state: Persisted): string {
  return JSON.stringify({ v: PERSISTED_VERSION,
    data: knownFields(state as unknown as Record<string, unknown>) });
}
