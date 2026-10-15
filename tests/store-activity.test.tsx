// @vitest-environment jsdom

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProvider, loadPersisted, serializePersisted, useApp } from "@/lib/store";
import type { SessionUser } from "@/lib/store";
import type { Application, AppStage, Notif } from "@/lib/types";
import { DEMO_APPLICATIONS, OPPORTUNITIES } from "@/lib/data";
import { OpportunityDetail } from "@/components/OpportunityDetail";

interface Snapshot {
  applications: Application[];
  saved: string[];
  notifications: Notif[];
}

type Action =
  | { type: "apply"; applicationId: string; opportunityId: string; note?: string }
  | { type: "advance"; applicationId: string; expectedStage: AppStage }
  | { type: "saved"; opportunityId: string; saved: boolean }
  | { type: "read"; notificationIds: string[] };

const account = (id = "synthetic-account-a"): SessionUser => ({
  id, email: `${id}@example.invalid`, name: "Synthetic student", avatar: null,
  providers: ["email"], profile: null, skills: [],
});

const notice: Notif = {
  id: "server-notice", kind: "application", title: "Synthetic application update",
  body: "A synthetic server notification", ago: "now", unread: true,
};

const empty = (): Snapshot => ({ applications: [], saved: [], notifications: [] });
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "content-type": "application/json" },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** A synthetic HTTP boundary: the actual provider and its actions are used.
 * No database, session cookies, external service or real account is involved. */
function activityServer(initial: Snapshot = empty(), user: SessionUser | null = account()) {
  const server = {
    user,
    snapshot: copy(initial),
    posts: [] as Action[],
    reads: [] as string[],
    pausePosts: false,
    pending: [] as { action: Action; response: ReturnType<typeof deferred<Response>> }[],
    getActivity: undefined as undefined | (() => Promise<Response>),
    signOut: undefined as undefined | (() => Promise<Response>),
    commit(action: Action): Response {
      switch (action.type) {
        case "apply":
          server.snapshot.applications.unshift({
            id: action.applicationId, opportunityId: action.opportunityId,
            stage: "Applied", updatedDaysAgo: 0, ...(action.note ? { note: action.note } : {}),
          });
          break;
        case "advance": {
          const application = server.snapshot.applications.find((row) => row.id === action.applicationId);
          if (!application || application.stage !== action.expectedStage) {
            return json({ ok: false, code: "stage_conflict", error: "Synthetic stage conflict", retryable: false }, 409);
          }
          // These tests advance the newly applied fixture exactly once.
          application.stage = "Accepted";
          break;
        }
        case "saved":
          server.snapshot.saved = action.saved
            ? [action.opportunityId, ...server.snapshot.saved.filter((id) => id !== action.opportunityId)]
            : server.snapshot.saved.filter((id) => id !== action.opportunityId);
          break;
        case "read":
          server.snapshot.notifications.forEach((row) => {
            if (action.notificationIds.includes(row.id)) row.unread = false;
          });
          break;
      }
      return json({ activity: copy(server.snapshot) });
    },
    releaseNext() {
      const pending = server.pending.shift();
      if (!pending) throw new Error("No synthetic write is pending");
      pending.response.resolve(server.commit(pending.action));
    },
  };

  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url === "/api/auth/session") return json({ user: copy(server.user), database: true });
    if (url === "/api/auth/signout") return server.signOut ? server.signOut() : json({ ok: true });
    if (url === "/api/activity" && (!init?.method || init.method === "GET")) {
      server.reads.push(server.user?.id ?? "no-account");
      return server.getActivity ? server.getActivity() : json({ activity: copy(server.snapshot) });
    }
    if (url === "/api/activity" && init?.method === "POST") {
      const action = JSON.parse(String(init.body)) as Action;
      server.posts.push(action);
      if (!server.pausePosts) return server.commit(action);
      const response = deferred<Response>();
      server.pending.push({ action, response });
      return response.promise;
    }
    throw new Error(`Unexpected test request: ${init?.method ?? "GET"} ${url}`);
  });

  vi.stubGlobal("fetch", fetch);
  return { ...server, fetch, server };
}

function Probe() {
  const app = useApp();
  return <>
    <pre data-testid="snapshot">{JSON.stringify({
      ready: app.ready, userId: app.user?.id ?? null, theme: app.theme,
      applications: app.applications, saved: app.saved, notifications: app.notifications,
    })}</pre>
    <button onClick={() => app.apply("synthetic-opportunity", "A note retained on another device")}>Apply</button>
    <button onClick={() => app.apply("synthetic-other-opportunity", "A distinct application")}>Apply another</button>
    <button onClick={() => {
      const application = app.applications.find((row) => row.opportunityId === "synthetic-opportunity");
      if (application) app.advance(application.id);
    }}>Advance</button>
    <button onClick={() => app.toggleSaved("synthetic-saved")}>Toggle saved</button>
    <button onClick={() => app.markAllRead()}>Read notifications</button>
    <button onClick={() => { void app.signOut(); }}>Sign out</button>
    <button onClick={() => { void app.refresh(); }}>Refresh session</button>
    <button onClick={() => app.setTheme("dark")}>Use dark theme</button>
  </>;
}

function mount() {
  return render(<AppProvider><Probe /></AppProvider>);
}

function state(): Snapshot & { ready: boolean; userId: string | null; theme: "dark" | "light" } {
  return JSON.parse(screen.getByTestId("snapshot").textContent!) as ReturnType<typeof state>;
}

async function ready() {
  await waitFor(() => expect(state().ready).toBe(true));
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("account activity persistence through AppProvider", () => {
  it("round-trips apply, stage, saved and notification state after clearing localStorage and mounting afresh", async () => {
    const { server } = activityServer({ ...empty(), notifications: [notice] });
    const first = mount();
    await ready();
    expect(state().applications).toEqual([]);
    expect(state().saved).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(server.posts).toHaveLength(1));
    await waitFor(() => expect(server.snapshot.applications).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Advance" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle saved" }));
    fireEvent.click(screen.getByRole("button", { name: "Read notifications" }));
    await waitFor(() => expect(server.posts).toHaveLength(4));
    await waitFor(() => expect(state().applications[0]?.stage).toBe("Accepted"));
    await waitFor(() => expect(server.snapshot.notifications[0].unread).toBe(false));
    expect(server.posts.map((action) => action.type)).toEqual(["apply", "advance", "saved", "read"]);
    expect(server.posts[0]).toMatchObject({ type: "apply", opportunityId: "synthetic-opportunity", note: "A note retained on another device" });
    expect(server.posts[1]).toMatchObject({ type: "advance", applicationId: server.snapshot.applications[0].id, expectedStage: "Applied" });

    const persistedOnServer = copy(server.snapshot);
    first.unmount();
    window.localStorage.clear();
    mount();
    await ready();

    expect(state()).toMatchObject({ ...persistedOnServer, userId: "synthetic-account-a" });
    expect(state().applications[0]).toMatchObject({
      opportunityId: "synthetic-opportunity", stage: "Accepted", note: "A note retained on another device",
    });
    expect(state().saved).toEqual(["synthetic-saved"]);
    expect(state().notifications).toEqual([{ ...notice, unread: false }]);
    expect(server.reads).toEqual(["synthetic-account-a", "synthetic-account-a"]);
  });

  it("does not mix cached prototype activity into a real account's empty server snapshot", async () => {
    const prototype = loadPersisted(null);
    window.localStorage.setItem("earnly:v3", serializePersisted({
      ...prototype,
      applications: [{ id: "cached-demo", opportunityId: "cached-opportunity", stage: "Paid", updatedDaysAgo: 0 }],
      saved: ["cached-saved"], notifications: [{ ...notice, id: "cached-notice" }],
    }));
    activityServer();
    mount();
    await ready();
    expect(state()).toMatchObject({ userId: "synthetic-account-a", ...empty() });
  });

  it("persists a signed-in theme change without a cached activity snapshot replacing the preference", async () => {
    activityServer();
    const first = mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Use dark theme" }));
    expect(state().theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(loadPersisted(window.localStorage.getItem("earnly:v3")).theme).toBe("dark");
    first.unmount();
    mount();
    await ready();
    expect(state().theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("retains a demo theme change when an activity action publishes its slice", async () => {
    const { server } = activityServer(empty(), null);
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Use dark theme" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(state().theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(loadPersisted(window.localStorage.getItem("earnly:v3")).theme).toBe("dark");
    expect(server.posts).toEqual([]);
    expect(server.reads).toEqual([]);
  });

  it("gives two distinct applications unique IDs even within the same millisecond", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const { server } = activityServer();
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply another" }));
    await waitFor(() => expect(server.posts).toHaveLength(2));
    await waitFor(() => expect(server.snapshot.applications).toHaveLength(2));
    expect(new Set(server.snapshot.applications.map((row) => row.id)).size).toBe(2);
    expect(new Set(state().applications.map((row) => row.id)).size).toBe(2);
    expect(state().applications.map((row) => row.opportunityId).sort()).toEqual([
      "synthetic-opportunity", "synthetic-other-opportunity",
    ]);
  });

  it("keeps no-account prototype behavior and local persistence without activity API calls", async () => {
    const { server, fetch } = activityServer(empty(), null);
    const prototype = loadPersisted(null);
    const first = mount();
    await ready();
    expect(state()).toMatchObject({
      userId: null, applications: prototype.applications, saved: prototype.saved, notifications: prototype.notifications,
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    fireEvent.click(screen.getByRole("button", { name: "Advance" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle saved" }));
    fireEvent.click(screen.getByRole("button", { name: "Read notifications" }));
    const changed = copy(state());
    expect(changed.applications[0]).toMatchObject({ opportunityId: "synthetic-opportunity", stage: "Accepted", note: "A note retained on another device" });
    expect(changed.saved).toEqual(["synthetic-saved", ...prototype.saved]);
    expect(changed.notifications.every((row) => !row.unread)).toBe(true);
    expect(server.posts).toEqual([]);
    expect(server.reads).toEqual([]);
    expect(fetch.mock.calls.every(([url]) => url === "/api/auth/session")).toBe(true);

    first.unmount();
    mount();
    await ready();
    expect(state()).toEqual(changed);
  });

  it("shows an optimistic change, then rolls it back and reports a failed write", async () => {
    const { server } = activityServer();
    server.pausePosts = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Toggle saved" }));
    expect(state().saved).toEqual(["synthetic-saved"]);
    await waitFor(() => expect(server.pending).toHaveLength(1));
    await act(async () => {
      server.pending.shift()!.response.resolve(json({ ok: false, code: "database_unavailable", error: "Synthetic database outage", retryable: true }, 503));
    });
    await waitFor(() => expect(state().saved).toEqual([]));
    expect(error).toHaveBeenCalled();
    expect(error.mock.calls.flat().map(String).join(" ")).toContain("Synthetic database outage");
    expect(server.snapshot).toEqual(empty());
  });

  it("restores the detail page's Apply action and draft note when an optimistic application fails", async () => {
    const listing = OPPORTUNITIES.find((opportunity) =>
      !DEMO_APPLICATIONS.some((application) => application.opportunityId === opportunity.id),
    )!;
    const { server } = activityServer();
    server.pausePosts = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<AppProvider><Probe /><OpportunityDetail id={listing.id} /></AppProvider>);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Apply for this" }));
    const draft = "Keep this note available if the server write fails.";
    fireEvent.change(screen.getByRole("textbox", { name: "A short note (optional)" }), { target: { value: draft } });
    fireEvent.click(screen.getByRole("button", { name: "Send application" }));
    expect(screen.getByText("Application applied", { exact: true })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Apply for this" })).toBe(null);
    await waitFor(() => expect(server.pending).toHaveLength(1));
    expect(server.posts[0]).toMatchObject({ type: "apply", opportunityId: listing.id, note: draft });

    await act(async () => {
      server.pending.shift()!.response.resolve(json({
        ok: false, code: "write_failed", error: "Synthetic application write failure", retryable: true,
      }, 500));
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply for this" })).toBeDefined());
    expect(screen.queryByText("Application applied", { exact: true })).toBe(null);
    expect(state().applications).toEqual([]);
    expect(error).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply for this" }));
    expect((screen.getByRole("textbox", { name: "A short note (optional)" }) as HTMLTextAreaElement).value).toBe(draft);
  });

  it("serializes rapid actions and rebases full snapshots without undoing independent optimistic updates", async () => {
    const { server } = activityServer({ ...empty(), notifications: [notice] });
    server.pausePosts = true;
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    fireEvent.click(screen.getByRole("button", { name: "Advance" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle saved" }));
    fireEvent.click(screen.getByRole("button", { name: "Read notifications" }));
    expect(server.posts).toHaveLength(1);
    expect(state().applications[0].stage).toBe("Accepted");
    expect(state().saved).toEqual(["synthetic-saved"]);
    expect(state().notifications[0].unread).toBe(false);

    for (let completed = 0; completed < 4; completed++) {
      await waitFor(() => expect(server.pending).toHaveLength(1));
      expect(server.posts).toHaveLength(completed + 1);
      await act(async () => { server.releaseNext(); });
      // Earlier full server snapshots must not erase later pending actions.
      expect(state().applications[0].stage).toBe("Accepted");
      expect(state().saved).toEqual(["synthetic-saved"]);
      expect(state().notifications[0].unread).toBe(false);
    }
    expect(server.posts.map((action) => action.type)).toEqual(["apply", "advance", "saved", "read"]);
    expect(state()).toMatchObject(server.snapshot);
  });

  it("rolls back only the failed intent while a later independent write can still succeed", async () => {
    const { server } = activityServer();
    server.pausePosts = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Toggle saved" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(state().saved).toEqual(["synthetic-saved"]);
    expect(state().applications[0].opportunityId).toBe("synthetic-opportunity");
    await act(async () => {
      server.pending.shift()!.response.resolve(json({ ok: false, code: "write_failed", error: "Synthetic first write failure", retryable: true }, 500));
    });
    await waitFor(() => expect(server.posts).toHaveLength(2));
    expect(state().saved).toEqual([]);
    expect(state().applications[0].opportunityId).toBe("synthetic-opportunity");
    await act(async () => { server.releaseNext(); });
    expect(state()).toMatchObject(server.snapshot);
    expect(state().applications).toHaveLength(1);
  });

  it("discards an old account's late write response after sign-out", async () => {
    const { server } = activityServer({
      applications: [{ id: "account-a-application", opportunityId: "private-a-opportunity", stage: "Applied", updatedDaysAgo: 0 }],
      saved: [], notifications: [notice],
    });
    server.pausePosts = true;
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Toggle saved" }));
    await waitFor(() => expect(server.pending).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(state().userId).toBe(null));
    const signedOut = copy(state());
    expect(signedOut.applications.some((row) => row.id === "account-a-application")).toBe(false);
    await act(async () => { server.releaseNext(); });
    expect(state()).toEqual(signedOut);
  });

  it("discards a slow account A read after refresh has loaded account B", async () => {
    const { server } = activityServer();
    const oldRead = deferred<Response>();
    server.getActivity = () => oldRead.promise;
    mount();
    await waitFor(() => expect(server.reads).toHaveLength(1));
    const accountB = { applications: [], saved: ["account-b-saved"], notifications: [] };
    server.user = account("synthetic-account-b");
    server.getActivity = async () => json({ activity: accountB });
    fireEvent.click(screen.getByRole("button", { name: "Refresh session" }));
    await waitFor(() => expect(state()).toMatchObject({ userId: "synthetic-account-b", ...accountB }));
    await act(async () => {
      oldRead.resolve(json({ activity: {
        applications: [{ id: "late-a", opportunityId: "private-a-opportunity", stage: "Paid", updatedDaysAgo: 0 }],
        saved: ["account-a-saved"], notifications: [notice],
      } }));
    });
    expect(state()).toMatchObject({ userId: "synthetic-account-b", ...accountB });
    expect(server.reads).toEqual(["synthetic-account-a", "synthetic-account-b"]);
  });

  it("does not let an old sign-out completion erase a newly refreshed account", async () => {
    const { server } = activityServer();
    const oldSignOut = deferred<Response>();
    server.signOut = () => oldSignOut.promise;
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(state().userId).toBe(null));

    const accountB = { applications: [], saved: ["account-b-saved"], notifications: [] };
    server.user = account("synthetic-account-b");
    server.snapshot = accountB;
    fireEvent.click(screen.getByRole("button", { name: "Refresh session" }));
    await waitFor(() => expect(state()).toMatchObject({ userId: "synthetic-account-b", ...accountB }));
    await act(async () => { oldSignOut.resolve(json({ ok: true })); });
    expect(state()).toMatchObject({ userId: "synthetic-account-b", ...accountB });
  });
});
