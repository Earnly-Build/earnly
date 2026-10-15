import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issue #3 — /app/* had no server-side authz: page payloads shipped to
 * anyone without JavaScript. The layout now gates on the server. These
 * tests drive the layout directly and capture redirect() targets.
 */

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession }));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children,
}));

import AppLayout from "@/app/app/layout";

function redirectTarget(fn: () => Promise<unknown>): Promise<string> {
  return fn().then(
    () => { throw new Error("expected a redirect"); },
    (e) => {
      // Next.js redirect() throws NEXT_REDIRECT with the digest carrying
      // the target path.
      const msg = String(e);
      const m = msg.match(/NEXT_REDIRECT;[^;]*;([^;]+);/) ??
        String((e as { digest?: string }).digest).match(/NEXT_REDIRECT;[^;]*;([^;]+);/);
      if (!m) throw e;
      return m[1];
    }
  );
}

const profile = (over: Record<string, unknown> = {}) => ({
  user_id: "u1", full_name: "T", course: null, grad_year: null,
  student_email: null, student_id: null, university_id: null,
  university_name: null, university_country: null, university_city: null,
  university_custom: false, location: null, bio: null,
  verification: "verified" as const, onboarded: true, onboarding_step: 0,
  availability: [], looking_for: [], work_area: "",
  ...over,
});

describe("/app server-side gate", () => {
  beforeEach(() => getSession.mockReset());

  it("no session → /signin (the curl -I case)", async () => {
    getSession.mockResolvedValue(null);
    expect(await redirectTarget(() => AppLayout({ children: null }))).toBe("/signin");
  });

  it("unverified session → /verify", async () => {
    getSession.mockResolvedValue({ id: "u1", profile: profile({ verification: "pending" }) });
    expect(await redirectTarget(() => AppLayout({ children: null }))).toBe("/verify");
  });

  it("verified but not onboarded → /onboarding", async () => {
    getSession.mockResolvedValue({ id: "u1", profile: profile({ onboarded: false }) });
    expect(await redirectTarget(() => AppLayout({ children: null }))).toBe("/onboarding");
  });

  it("verified + onboarded → renders children, no redirect", async () => {
    getSession.mockResolvedValue({ id: "u1", profile: profile() });
    const out = await AppLayout({ children: "PAGE" });
    // The layout resolves to an AppShell element carrying children —
    // the guard passed, no redirect was thrown.
    expect((out as { props: { children: unknown } }).props.children).toBe("PAGE");
  });
});
