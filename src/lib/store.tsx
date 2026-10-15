"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEMO_APPLICATIONS,
  DEMO_NOTIFS,
  DEMO_STUDENT,
  DEMO_TXNS,
} from "./data";
import { DEFAULT_PREFS } from "./ai";
import { loadPersisted, serializePersisted } from "./persistence";
import type { Persisted } from "./persistence";
import type {
  AiPrefs,
  AiResult,
  AppStage,
import { ActivityClient, activitySlice } from "./activity-client";
import type { ActivityState } from "./activity-types";
import type {
  AiPrefs,
  AiResult,
  Application,
  Notif,
  Student,
  Txn,
  VerificationState,
} from "./types";

const KEY = "earnly:v3";

export interface ProfileRow {
  full_name: string | null;
  course: string | null;
  grad_year: number | null;
  student_email: string | null;
  student_id: string | null;
  university_id: string | null;
  university_name: string | null;
  university_country: string | null;
  university_city: string | null;
  university_custom: boolean;
  location: string | null;
  bio: string | null;
  verification: VerificationState;
  onboarded: boolean;
  onboarding_step: number;
  availability: string[];
  looking_for: string[];
  work_area: string;
  ai_prefs: AiPrefs | null;
}

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  providers: string[];
  profile: ProfileRow | null;
  skills: string[];
}

const initial: Persisted = {
  signedIn: false,
  authMethod: null,
  verification: "required",
  onboarded: false,
  prefs: DEFAULT_PREFS,
  aiPrefs: DEFAULT_PREFS,
  saved: ["t-website-designer", "i-react-intern"],
  applications: DEMO_APPLICATIONS,
  notifications: DEMO_NOTIFS,
  theme: "light",
};

/**
 * Persisted-payload versioning (issue #27).
 *
 * The stored value is an envelope `{ v, data }`: `v` is the schema
 * version, `data` the Persisted slice. Payloads written before the
 * envelope existed are version 0 (a bare Persisted object) and migrate
 * forward through MIGRATIONS.
 *
 * Rules: missing/unparsable → `initial` (never throw); older → migrate
 * each version step; newer (a payload from a future deploy) → `initial`,
 * never half-apply.
 */
export const SCHEMA_VERSION = 1;

interface Envelope {
  v: number;
  data: unknown;
}

/** MIGRATIONS[n] upgrades a v<n> payload's data to v<n+1>. */
const MIGRATIONS: Record<number, (data: unknown) => unknown> = {
  // v0 → v1: the pre-envelope bare Persisted object carries forward
  // verbatim — the shape itself hasn't changed; this documents the
  // migration seam for the next shape change.
  0: (data) => data,
};

export function loadPersisted(raw: string | null): Persisted {
  if (!raw) return initial;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return initial;                          // corrupt JSON → defaults
  }
  if (!parsed || typeof parsed !== "object") return initial;
  const env = parsed as Partial<Envelope>;
  let version = typeof env.v === "number" ? env.v : 0;
  let data: unknown = version === 0 ? parsed : env.data;
  if (version > SCHEMA_VERSION) return initial;   // future payload — discard
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return initial;                     // chain gap — discard
    data = step(data);
    version++;
  }
  return { ...initial, ...(data as Persisted) };
}

export function serializePersisted(state: Persisted): string {
  return JSON.stringify({ v: SCHEMA_VERSION, data: state } satisfies Envelope);
}

export interface ProfilePatch {
  fullName?: string;
  course?: string;
  gradYear?: number | string;
  studentEmail?: string;
  studentId?: string;
  location?: string;
  bio?: string;
  verification?: VerificationState;
  onboarded?: boolean;
  onboardingStep?: number;
  availability?: string[];
  lookingFor?: string[];
  workArea?: string;
  skills?: string[];
  aiPrefs?: AiPrefs;
  university?: {
    id?: string;
    name: string;
    country: string;
    city?: string;
    custom?: boolean;
  };
}

interface Ctx extends Persisted {
  student: Student;
  txns: Txn[];
  ready: boolean;
  user: SessionUser | null;
  database: boolean;
  save: (patch: ProfilePatch, opts?: { quiet?: boolean }) => Promise<boolean>;
  refresh: () => Promise<void>;
  signIn: (method: "google" | "email") => void;
  signOut: () => Promise<void>;
  submitVerification: (patch?: ProfilePatch) => Promise<boolean>;
  approveVerification: () => Promise<boolean>;
  failVerification: () => Promise<boolean>;
  resetVerification: () => Promise<boolean>;
  completeOnboarding: (prefs: AiPrefs, patch?: ProfilePatch) => Promise<boolean>;
  saveAiPrefs: (prefs: AiPrefs) => void;
  apply: (opportunityId: string, note?: string) => void;
  advance: (applicationId: string) => void;
  toggleSaved: (opportunityId: string) => void;
  markAllRead: () => void;
  setTheme: (t: "dark" | "light") => void;
  setAiResults: (r: AiResult[] | null) => void;
  aiResults: AiResult[] | null;
  reset: () => void;
}

/** Max length for an application note — enforced client-side (textarea)
 * and store-side (truncate). Documented in the apply flow. */
export const NOTE_MAX = 500;

/** Build the application record for a fresh apply. The note is optional;
 *  when present it's truncated to NOTE_MAX (store-side defense — the UI
 *  caps the textarea but a caller could bypass it). */
export function buildApplication(
  opportunityId: string,
  note?: string,
): Application {
  return {
    id: `a${Date.now()}-${crypto.randomUUID()}`,
    opportunityId,
    stage: "Applied",
    updatedDaysAgo: 0,
    ...(note ? { note: note.slice(0, NOTE_MAX) } : {}),
  };
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(initial);
  const [activity] = useState(() => new ActivityClient(initial, (slice) => setState((s) => ({ ...s, ...slice }))));
  const refreshVersion = useRef(0);
  const demoActivity = useRef<ActivityState>(activitySlice(initial));
  const [ready, setReady] = useState(false);
  const [aiResults, setAiResults] = useState<AiResult[] | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [database, setDatabase] = useState(false);

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      if (!res.ok) throw new Error("Session lookup failed.");
      const data = (await res.json()) as { user: SessionUser | null; database?: boolean };
      if (version !== refreshVersion.current) return;
      setDatabase(Boolean(data.database));
      const id = data.user?.id ?? null;
      if (!activity.belongsTo(id)) activity.reset(id);
      setUser(data.user ?? null);
      if (data.user?.profile) {
        setState((s) => ({
          ...s,
          signedIn: true,
          verification: data.user?.profile?.verification ?? "required",
          onboarded: Boolean(data.user?.profile?.onboarded),
          aiPrefs: (data.user?.profile?.ai_prefs as AiPrefs) ?? s.aiPrefs,
        }));
      }
      if (data.user) {
        const revision = activity.revision;
        const response = await fetch("/api/activity", { cache: "no-store", headers: { "x-earnly-user": data.user.id } });
        const payload = (await response.json()) as { activity?: ActivityState };
        if (!response.ok || !payload.activity) throw new Error("Activity lookup failed.");
        if (version === refreshVersion.current) activity.hydrate(payload.activity, revision);
      }
    } catch (error) {
      console.error("[earnly] session/activity refresh failed", error);
      // No-account visits retain the local prototype; a known real account
      // starts empty on read failure instead of inheriting another account/demo.
    }
  }, [activity]);

  useEffect(() => {
    // Read back the persisted prototype store first so a no-account visit still
    // renders, then resolve the server session. `ready` only flips once the
    // session lookup has settled: route guards must not run against a stale
    // "signed out" snapshot and bounce a just-authenticated user to /signin.
    try {
      const raw = window.localStorage.getItem(KEY);
      // Hydration: the persisted store can only be read on the client, so this
      // one synchronous setState is the intentional hand-off from SSR. The
      // splash in AppShell keeps the first paint identical.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setState(loadPersisted(raw, initial));
      if (raw) {
        const persisted = loadPersisted(raw);
        demoActivity.current = activitySlice(persisted);
        activity.reset(null, persisted);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState(persisted);
      }
    } catch {
      /* a prototype store; a corrupt value just starts fresh */
    }
    let cancelled = false;
    void (async () => {
      await refresh();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
      // This is a request generation counter, not a DOM ref: invalidate all
      // outstanding session lookups when this provider is disposed.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      refreshVersion.current++;
      activity.dispose();
    };
  }, [refresh, activity]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(KEY, serializePersisted(state));
      if (!user) demoActivity.current = activitySlice(state);
      // Real account activity is server-owned; do not carry it into a later
      // anonymous visit or another account through the prototype cache.
      window.localStorage.setItem(KEY, serializePersisted(user ? { ...state, ...demoActivity.current } : state));
    } catch {
      /* private mode */
    }
    document.documentElement.dataset.theme = state.theme;
  }, [state, ready, user]);

  const update = useCallback((patch: Partial<Persisted>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const save = useCallback(
    async (patch: ProfilePatch, opts?: { quiet?: boolean }) => {
      // Always reflect the change locally so the UI stays instant…
      setState((s) => ({
        ...s,
        verification: patch.verification ?? s.verification,
        onboarded: patch.onboarded ?? s.onboarded,
        aiPrefs: patch.aiPrefs ?? s.aiPrefs,
      }));
      // …then persist it when there is a real account behind the session.
      if (!user) return true;
      try {
        const res = await fetch("/api/profile", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = (await res.json()) as { user?: SessionUser; error?: string };
        if (!res.ok) {
          if (!opts?.quiet) console.error("[earnly] save failed", data.error);
          return false;
        }
        if (data.user) setUser(data.user);
        return true;
      } catch (error) {
        console.error("[earnly] save failed", error);
        return false;
      }
    },
    [user]
  );

  const value = useMemo<Ctx>(() => {
    const profile = user?.profile ?? null;
    const verification: VerificationState = user
      ? (profile?.verification ?? "required")
      : state.verification;
    const onboarded = user ? Boolean(profile?.onboarded) : state.onboarded;
    const signedIn = Boolean(user) || state.signedIn;
    const aiPrefs = (profile?.ai_prefs as AiPrefs | undefined) ?? state.aiPrefs;

    const student: Student = user
      ? {
          name: profile?.full_name || user.name || "Student",
          avatar: user.avatar || "/img/avatar-1.jpg",
          university: profile?.university_name || "Add your university",
          course: profile?.course || "Add your course",
          gradYear: profile?.grad_year ?? new Date().getFullYear() + 2,
          studentEmail: profile?.student_email || user.email || "",
          studentId: profile?.student_id || "",
          location: profile?.location || "",
          bio: profile?.bio || "",
          skills: user.skills.length ? user.skills : aiPrefs.skills,
          rating: DEMO_STUDENT.rating,
          reviewCount: DEMO_STUDENT.reviewCount,
          completedCount: DEMO_STUDENT.completedCount,
          completionRate: DEMO_STUDENT.completionRate,
          earnedTotal: DEMO_STUDENT.earnedTotal,
        }
      : { ...DEMO_STUDENT, skills: state.prefs.skills.length ? state.prefs.skills : DEMO_STUDENT.skills };

    return {
      ...state,
      signedIn,
      verification,
      onboarded,
      aiPrefs,
      user,
      database,
      student,
      txns: DEMO_TXNS,
      ready,
      aiResults,
      setAiResults,
      save,
      refresh,
      signIn: (method) =>
        update({ signedIn: true, authMethod: method, verification: "required" }),
      signOut: async () => {
        refreshVersion.current++;
        activity.reset(null, initial);
        setUser(null);
        setState({ ...initial, theme: state.theme });
        try {
          await fetch("/api/auth/signout", { method: "POST" });
        } catch {
          /* signing out locally is enough */
        }
      },
      submitVerification: (patch) =>
        save({ verification: "pending", ...(patch ?? {}) }),
      // Simulate-* are demo simulators: they flip LOCAL state only and
      // never write through the profile API — a signed-in user's stored
      // verification is server-derived and snaps back on refresh().
      approveVerification: () => {
        update({ verification: "verified" });
        return Promise.resolve(true);
      },
      failVerification: () => {
        update({ verification: "failed" });
        return Promise.resolve(true);
      },
      resetVerification: () => {
        update({ verification: "required" });
        return Promise.resolve(true);
      },
      completeOnboarding: (prefs, patch) =>
        save({
          onboarded: true,
          onboardingStep: 0,
          aiPrefs: prefs,
          skills: prefs.skills,
          ...(patch ?? {}),
        }),
      saveAiPrefs: (prefs) => {
        void save({ aiPrefs: prefs }, { quiet: true });
      },
      apply: (opportunityId, note) => {
        if (activity.state.applications.some((a) => a.opportunityId === opportunityId)) return;
        const application = buildApplication(opportunityId, note);
        activity.dispatch({ type: "apply", applicationId: application.id, opportunityId, note: application.note });
      },
      advance: (applicationId) => {
        const application = activity.state.applications.find((a) => a.id === applicationId);
        if (application && application.stage !== "Paid") activity.dispatch({ type: "advance", applicationId, expectedStage: application.stage });
      },
      toggleSaved: (opportunityId) => activity.dispatch({ type: "saved", opportunityId, saved: !activity.state.saved.includes(opportunityId) }),
      markAllRead: () => activity.dispatch({ type: "read", notificationIds: activity.state.notifications.filter((n) => n.unread).map((n) => n.id) }),
      setTheme: (theme) => update({ theme }),
      reset: () => {
        if (user) {
          void refresh();
          return;
        }
        activity.reset(null, initial);
        setState(initial);
        setAiResults(null);
      },
    };
  }, [state, ready, aiResults, update, user, database, save, refresh, activity]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
