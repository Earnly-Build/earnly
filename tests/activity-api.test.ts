import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { OPPORTUNITIES } from "@/lib/data";

// Route contracts only: persistence and concurrency are exercised separately
// against PostgreSQL. Keep the real parser so malformed input is not mocked away.
const mocks = vi.hoisted(() => ({
  databaseConfigured: true,
  getSession: vi.fn(),
  loadActivity: vi.fn(),
  changeActivity: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  get databaseConfigured() { return mocks.databaseConfigured; },
  db: vi.fn(() => { throw new Error("This suite must not access a database"); }),
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/activity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/activity")>();
  return { ...actual, loadActivity: mocks.loadActivity, changeActivity: mocks.changeActivity };
});

const { ActivityError, parseActivityAction } = await import("@/lib/activity");
const route = await import("@/app/api/activity/route");

const opportunityId = OPPORTUNITIES[0].id;
const applicationId = "app-synthetic-1";
const customer = { id: "user-a", email: "a@example.test", name: "A" };
const activity = {
  applications: [{ id: applicationId, opportunityId, stage: "Applied", updatedDaysAgo: 0 }],
  saved: [opportunityId],
  notifications: [{ id: "notif-synthetic-1", kind: "application", title: "Applied",
    body: "Synthetic application", ago: "now", unread: true }],
};
const apply = { type: "apply", applicationId, opportunityId };

function post(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://earnly.test/api/activity", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://earnly.test", ...headers },
    body: JSON.stringify(body),
  });
}

async function expectError(response: Response, status: number, code?: string) {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(Object.keys(body).sort()).toEqual(["code", "error", "ok", "retryable"]);
  expect(body).toMatchObject({ ok: false, code: code ?? expect.any(String),
    error: expect.any(String), retryable: expect.any(Boolean) });
  return body;
}

beforeEach(() => {
  mocks.databaseConfigured = true;
  mocks.getSession.mockReset().mockResolvedValue(customer);
  mocks.loadActivity.mockReset().mockResolvedValue(activity);
  mocks.changeActivity.mockReset().mockResolvedValue(activity);
});

describe("strict activity intent parsing", () => {
  it.each([
    apply,
    { type: "advance", applicationId, expectedStage: "Applied" },
    { type: "saved", opportunityId, saved: false },
    { type: "read", notificationIds: ["notif-synthetic-1"] },
  ])("accepts an explicit intent: $type", (action) => {
    expect(parseActivityAction(action)).toEqual(action);
  });

  it("preserves notes and truncates at the existing 500-character cap", () => {
    const note = "  A synthetic note with spacing.  ";
    expect(parseActivityAction({ ...apply, note })).toMatchObject({ note });
    expect(parseActivityAction({ ...apply, note: "x".repeat(501) }))
      .toMatchObject({ note: "x".repeat(500) });
  });

  it("accepts discovered opportunity IDs outside the seeded demo catalog", () => {
    const dynamicId = "ai-community-new-opportunity-42";
    expect(parseActivityAction({ ...apply, opportunityId: dynamicId }))
      .toEqual({ ...apply, opportunityId: dynamicId });
    expect(parseActivityAction({ type: "saved", opportunityId: dynamicId, saved: true }))
      .toEqual({ type: "saved", opportunityId: dynamicId, saved: true });
  });

  it("can mark all notifications read even when an account has more than 1000", () => {
    const notificationIds = Array.from({ length: 1001 }, (_, index) => `notification-${index}`);
    expect(parseActivityAction({ type: "read", notificationIds })).toEqual({ type: "read", notificationIds });
  });

  it.each([
    null, [], "apply", {}, { type: "replace" },
    { ...apply, userId: "user-b" },
    { ...apply, stage: "Paid" },
    { ...apply, note: 123 },
    { ...apply, applicationId: "" },
    { ...apply, opportunityId: "invalid opportunity id" },
    { type: "advance", applicationId, expectedStage: "Unknown" },
    { type: "advance", applicationId, expectedStage: "Applied", stage: "Paid" },
    { type: "saved", opportunityId, saved: "false" },
    { type: "saved", opportunityId, saved: true, userId: "user-b" },
    { type: "saved", opportunityId: "../invalid", saved: true },
    { type: "read", notificationIds: "notif-synthetic-1" },
    { type: "read", notificationIds: [1] },
    { type: "read", notificationIds: ["notif-synthetic-1"], unread: true },
  ])("rejects malformed or client-controlled fields: %j", (body) => {
    expect(() => parseActivityAction(body)).toThrow(ActivityError);
    try {
      parseActivityAction(body);
    } catch (error) {
      expect(error).toMatchObject({ status: 400 });
    }
  });
});

describe("authenticated activity API", () => {
  it("loads only the session user's snapshot", async () => {
    const response = await route.GET(new NextRequest("https://earnly.test/api/activity"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, activity });
    expect(mocks.loadActivity).toHaveBeenCalledExactlyOnceWith("user-a");
    expect(mocks.changeActivity).not.toHaveBeenCalled();
  });

  it("passes a validated intent with the session identity", async () => {
    const response = await route.POST(post(apply));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, activity });
    expect(mocks.changeActivity).toHaveBeenCalledExactlyOnceWith("user-a", apply);
  });

  it("passes a discovered opportunity to account persistence", async () => {
    const action = { ...apply, opportunityId: "ai-community-new-opportunity-42" };
    expect((await route.POST(post(action))).status).toBe(200);
    expect(mocks.changeActivity).toHaveBeenCalledExactlyOnceWith("user-a", action);
  });

  it("rejects a stale account hint on reads and writes before repository access", async () => {
    mocks.getSession.mockResolvedValue({ ...customer, id: "user-b" });
    const request = new NextRequest("https://earnly.test/api/activity", {
      headers: { "x-earnly-user": "user-a" },
    });
    await expectError(await route.GET(request), 409, "account_changed");
    await expectError(await route.POST(post(apply, { "x-earnly-user": "user-a" })), 409, "account_changed");
    expect(mocks.loadActivity).not.toHaveBeenCalled();
    expect(mocks.changeActivity).not.toHaveBeenCalled();
  });

  it("accepts a matching hint but never uses it to authenticate", async () => {
    const request = new NextRequest("https://earnly.test/api/activity", {
      headers: { "x-earnly-user": "user-a" },
    });
    expect((await route.GET(request)).status).toBe(200);
    expect((await route.POST(post(apply, { "x-earnly-user": "user-a" }))).status).toBe(200);
    mocks.getSession.mockResolvedValue(null);
    await expectError(await route.GET(request), 401, "unauthorized");
  });

  it("rejects unauthenticated reads and writes before repository access", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expectError(await route.GET(new NextRequest("https://earnly.test/api/activity")), 401, "unauthorized");
    await expectError(await route.POST(post(apply)), 401, "unauthorized");
    expect(mocks.loadActivity).not.toHaveBeenCalled();
    expect(mocks.changeActivity).not.toHaveBeenCalled();
  });

  it("returns unavailable when persistence is not configured", async () => {
    mocks.databaseConfigured = false;
    await expectError(await route.GET(new NextRequest("https://earnly.test/api/activity")), 503);
    await expectError(await route.POST(post(apply)), 503);
    expect(mocks.loadActivity).not.toHaveBeenCalled();
    expect(mocks.changeActivity).not.toHaveBeenCalled();
  });

  it("rejects a foreign-origin mutation before repository access", async () => {
    await expectError(await route.POST(post(apply, { origin: "https://foreign.example.test" })), 403);
    expect(mocks.changeActivity).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without attempting a write", async () => {
    const request = new NextRequest("https://earnly.test/api/activity", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{",
    });
    await expectError(await route.POST(request), 400);
    expect(mocks.changeActivity).not.toHaveBeenCalled();
  });

  it("rejects a supplied owner rather than silently accepting it", async () => {
    await expectError(await route.POST(post({ ...apply, userId: "user-b" })), 400);
    expect(mocks.changeActivity).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", 404, "Application not found."],
    ["conflict", 409, "This application changed. Refresh before advancing it."],
  ] as const)("preserves the %s repository error contract", async (code, status, message) => {
    mocks.changeActivity.mockRejectedValue(new ActivityError(code, message, status));
    const body = await expectError(await route.POST(post(apply)), status, code);
    expect(body.error).toBe(message);
    expect(body.retryable).toBe(false);
  });

  it.each(["read", "write"] as const)("does not expose internal %s errors", async (operation) => {
    const detail = "synthetic-private-database-detail";
    vi.spyOn(console, "error").mockImplementation(() => {});
    if (operation === "read") mocks.loadActivity.mockRejectedValue(new Error(detail));
    else mocks.changeActivity.mockRejectedValue(new Error(detail));
    const response = operation === "read" ? await route.GET(new NextRequest("https://earnly.test/api/activity")) : await route.POST(post(apply));
    const body = await expectError(response, 500);
    expect(body.error).not.toContain(detail);
  });
});
