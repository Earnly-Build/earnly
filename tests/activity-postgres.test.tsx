// @vitest-environment jsdom
/** Optional real Postgres round-trip. Uses only a disposable local database:
 * EARNLY_TEST_POSTGRES=1 npm test -- tests/activity-postgres.test.tsx
 * Requires psql and an existing local earnly_activity_test DB on port15432.
 * The default npm test run does not connect to any database or network service.
 */
import React from "react";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ActivityState } from "@/lib/activity-types";

const session = vi.hoisted(() => ({ id: "11111111-1111-4111-8111-111111111111" as string | null }));
vi.mock("@/lib/db", () => ({ db: () => sql, databaseConfigured: true }));
vi.mock("@/lib/session", () => ({ getSession: async () => session.id ? { id: session.id } : null }));
import { GET, POST } from "@/app/api/activity/route";
import { AppProvider, useApp } from "@/lib/store";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const args = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
  "-h", "127.0.0.1", "-p", "15432", "-U", "earnly_test", "-d", "earnly_activity_test"];
function psql(command: string) {
  if (process.env.EARNLY_TEST_POSTGRES !== "1") throw new Error("Local Postgres test is not enabled");
  try {
    return execFileSync("psql", [...args, "-c", command], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (cause) {
    const stderr = String((cause as { stderr?: unknown }).stderr ?? cause);
    throw Object.assign(new Error(stderr), { code: stderr.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1] });
  }
}
// Test-only adapter: the repository's real SQL runs in Postgres. It never uses
// Neon, HTTP, production credentials or a SQL-interpreting in-memory fake.
function literal(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (Array.isArray(value)) return value.length ? `ARRAY[${value.map(literal).join(",")}]` : "ARRAY[]::text[]";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}
interface Query { text: string; values: unknown[]; then: Promise<unknown[]>["then"] }
function execute(queries: Query[], options?: { readOnly?: boolean }): unknown[][] {
  const commands = queries.map(({ text, values }) => {
    const bound = text.replace(/\$(\d+)/g, (_, n: string) => literal(values[Number(n) - 1]));
    return `WITH result AS (${bound}) SELECT coalesce(json_agg(result), '[]'::json) FROM result;`;
  });
  const output = psql(`BEGIN ISOLATION LEVEL REPEATABLE READ ${options?.readOnly ? "READ ONLY" : ""};\n${commands.join("\n")}\nCOMMIT;`);
  return output.trim().split("\n").filter(Boolean).map((row) => JSON.parse(row) as unknown[]);
}
const sql = Object.assign((strings: TemplateStringsArray, ...values: unknown[]): Query => {
  const text = strings.reduce((out, chunk, index) => out + (index ? `$${index}` : "") + chunk, "");
  const query: Query = { text, values, then: (resolve, reject) => Promise.resolve().then(() => execute([query])[0]).then(resolve, reject) };
  return query;
}, { transaction: async (queries: Query[], options?: { readOnly?: boolean }) => execute(queries, options) });

function request(action: unknown) {
  return new Request("http://localhost/api/activity", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify(action) });
}
async function post(action: unknown) { return POST(request(action) as never); }
async function snapshot(): Promise<ActivityState> { return (await (await GET(new Request("http://localhost/api/activity") as never)).json()).activity; }
function Probe() {
  const app = useApp();
  return <>
    <pre data-testid="pg-state">{JSON.stringify({ ready: app.ready, applications: app.applications, saved: app.saved, notifications: app.notifications })}</pre>
    <button onClick={() => app.apply("dynamic-ai-opportunity", "Synthetic user's note")}>Apply</button>
    <button onClick={() => app.advance(app.applications[0].id)}>Advance</button>
    <button onClick={() => app.toggleSaved("dynamic-ai-opportunity")}>Save</button>
    <button onClick={() => app.markAllRead()}>Read</button>
  </>;
}
const ui = () => JSON.parse(screen.getByTestId("pg-state").textContent!) as ActivityState & { ready: boolean };

describe.skipIf(process.env.EARNLY_TEST_POSTGRES !== "1")("real local Postgres activity", () => {
  beforeAll(() => {
    for (const name of ["0001_init.sql", "0002_wallets.sql", "0003_activity.sql"]) {
      psql(readFileSync(path.resolve("db/migrations", name), "utf8"));
    }
  });
  beforeEach(() => {
    session.id = USER_A;
    window.localStorage.clear();
    psql(`delete from users where id in ('${USER_A}','${USER_B}');
      insert into users(id,name) values ('${USER_A}','Synthetic A'),('${USER_B}','Synthetic B');
      insert into notifications(user_id,id,kind,title,body) values
        ('${USER_A}','n1','application','Synthetic notice','Local fixture'),
        ('${USER_B}','n1','application','Other user notice','Local fixture');`);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

  it("rejects unauthenticated reads and writes before any activity mutation", async () => {
    session.id = null;
    expect((await GET(new Request("http://localhost/api/activity") as never)).status).toBe(401);
    expect((await post({ type: "saved", opportunityId: "dynamic-ai-opportunity", saved: true })).status).toBe(401);
  });

  it("commits all four operations and reads them back from a separate transaction", async () => {
    expect((await post({ type: "apply", applicationId: "a1", opportunityId: "dynamic-ai-opportunity", note: "Synthetic user's " + "x".repeat(600) })).status).toBe(200);
    expect((await post({ type: "advance", applicationId: "a1", expectedStage: "Applied" })).status).toBe(200);
    expect((await post({ type: "saved", opportunityId: "dynamic-ai-opportunity", saved: true })).status).toBe(200);
    expect((await post({ type: "read", notificationIds: ["n1"] })).status).toBe(200);
    const data = await snapshot();
    expect(data.applications).toHaveLength(1);
    expect(data.applications[0]).toMatchObject({ id: "a1", stage: "Accepted", opportunityId: "dynamic-ai-opportunity" });
    expect(data.applications[0].note).toHaveLength(500);
    expect(data.saved).toEqual(["dynamic-ai-opportunity"]);
    expect(data.notifications[0].unread).toBe(false);
    await post({ type: "saved", opportunityId: "dynamic-ai-opportunity", saved: false });
    expect((await snapshot()).saved).toEqual([]);
  });

  it("keeps retries idempotent and rejects stale stages without losing the first note", async () => {
    await post({ type: "apply", applicationId: "a1", opportunityId: "dynamic-ai-opportunity", note: "First note" });
    await post({ type: "apply", applicationId: "a2", opportunityId: "dynamic-ai-opportunity", note: "Retry note" });
    await post({ type: "advance", applicationId: "a1", expectedStage: "Applied" });
    expect((await post({ type: "advance", applicationId: "a1", expectedStage: "Applied" })).status).toBe(409);
    const data = await snapshot();
    expect(data.applications).toHaveLength(1);
    expect(data.applications[0]).toMatchObject({ id: "a1", note: "First note", stage: "Accepted" });
  });

  it("isolates another account's applications, saved items and notification reads", async () => {
    await post({ type: "apply", applicationId: "a1", opportunityId: "dynamic-ai-opportunity" });
    await post({ type: "saved", opportunityId: "dynamic-ai-opportunity", saved: true });
    await post({ type: "read", notificationIds: ["n1"] });
    session.id = USER_B;
    const data = await snapshot();
    expect(data.applications).toEqual([]);
    expect(data.saved).toEqual([]);
    expect(data.notifications[0].unread).toBe(true);
    expect((await post({ type: "advance", applicationId: "a1", expectedStage: "Applied" })).status).toBe(404);
  });

  it("round-trips the real AppProvider and routes through Postgres after clearing localStorage", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/auth/session") return Response.json({ user: { id: USER_A, email: "synthetic@example.invalid", name: "Synthetic A", avatar: null, providers: ["email"], profile: null, skills: [] }, database: true });
      if (String(input) === "/api/activity") return init?.method === "POST" ? POST(request(JSON.parse(String(init.body))) as never) : GET(new Request("http://localhost/api/activity") as never);
      throw new Error("Unexpected local test request");
    }));
    const first = render(<AppProvider><Probe /></AppProvider>);
    await waitFor(() => expect(ui().ready).toBe(true));
    fireEvent.click(screen.getByText("Apply"));
    fireEvent.click(screen.getByText("Advance"));
    fireEvent.click(screen.getByText("Save"));
    fireEvent.click(screen.getByText("Read"));
    await waitFor(async () => {
      const data = await snapshot();
      expect(data.applications[0]?.stage).toBe("Accepted");
      expect(data.saved).toEqual(["dynamic-ai-opportunity"]);
      expect(data.notifications[0].unread).toBe(false);
    });
    first.unmount();
    window.localStorage.clear();
    render(<AppProvider><Probe /></AppProvider>);
    await waitFor(() => expect(ui().ready).toBe(true));
    expect(ui().applications[0]).toMatchObject({ stage: "Accepted", note: "Synthetic user's note" });
    expect(ui().saved).toEqual(["dynamic-ai-opportunity"]);
    expect(ui().notifications[0].unread).toBe(false);
  });
});
