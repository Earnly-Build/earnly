"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  apply: (opportunityId: string) => void;
  advance: (applicationId: string) => void;
  toggleSaved: (opportunityId: string) => void;
  markAllRead: () => void;
  setTheme: (t: "dark" | "light") => void;
  setAiResults: (r: AiResult[] | null) => void;
  aiResults: AiResult[] | null;
  reset: () => void;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(initial);
  const [ready, setReady] = useState(false);
  const [aiResults, setAiResults] = useState<AiResult[] | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [database, setDatabase] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", { cache: "no-store" });
      const data = (await res.json()) as { user: SessionUser | null; database?: boolean };
      setDatabase(Boolean(data.database));
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
    } catch {
      /* offline: the local prototype store still works */
    }
  }, []);

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
    };
  }, [refresh]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(KEY, serializePersisted(state));
    } catch {
      /* private mode */
    }
    document.documentElement.dataset.theme = state.theme;
  }, [state, ready]);

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
        try {
          await fetch("/api/auth/signout", { method: "POST" });
        } catch {
          /* signing out locally is enough */
        }
        setUser(null);
        setState({ ...initial, theme: state.theme });
      },
      submitVerification: (patch) =>
        save({ verification: "pending", ...(patch ?? {}) }),
      approveVerification: () => save({ verification: "verified" }),
      failVerification: () => save({ verification: "failed" }),
      resetVerification: () => save({ verification: "required" }),
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
      apply: (opportunityId) =>
        setState((s) =>
          s.applications.some((a) => a.opportunityId === opportunityId)
            ? s
            : {
                ...s,
                applications: [
                  {
                    id: `a${Date.now()}`,
                    opportunityId,
                    stage: "Applied" as AppStage,
                    updatedDaysAgo: 0,
                  },
                  ...s.applications,
                ],
              }
        ),
      advance: (applicationId) =>
        setState((s) => ({
          ...s,
          applications: s.applications.map((a) =>
            a.id === applicationId
              ? { ...a, stage: nextStage(a.stage), updatedDaysAgo: 0 }
              : a
          ),
        })),
      toggleSaved: (opportunityId) =>
        setState((s) => ({
          ...s,
          saved: s.saved.includes(opportunityId)
            ? s.saved.filter((x) => x !== opportunityId)
            : [opportunityId, ...s.saved],
        })),
      markAllRead: () =>
        setState((s) => ({
          ...s,
          notifications: s.notifications.map((n) => ({ ...n, unread: false })),
        })),
      setTheme: (theme) => update({ theme }),
      reset: () => {
        setState(initial);
        setAiResults(null);
      },
    };
  }, [state, ready, aiResults, update, user, database, save, refresh]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

function nextStage(stage: AppStage): AppStage {
  const order: AppStage[] = [
    "Applied",
    "Accepted",
    "In progress",
    "Submitted",
    "Completed",
    "Paid",
  ];
  const i = order.indexOf(stage);
  return order[Math.min(i + 1, order.length - 1)];
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
