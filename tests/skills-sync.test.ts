import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issue #22 — skills sync looped a delete per removed + an insert per
 * added skill (up to ~40 round-trips in one request, non-atomic). Now
 * one set-based delete + one multi-row insert in a transaction.
 */

const cookieJar = new Map<string, string>();
const liveSessions = new Set<string>();
let skillRows: { skill: string; custom: boolean }[] = [];
let statementLog: { text: string; params: unknown[] }[] = [];

/** Apply the statement's effect to the in-memory tables. */
function apply(text: string, values: unknown[]): unknown[] {
  if (text.includes("select skill from user_skills"))
    return skillRows.map((r) => ({ skill: r.skill }));
  if (text.includes("select * from users"))
    return [{ id: values[0], email: "a@b.c", name: "T", avatar_url: null }];
  if (text.includes("select * from profiles"))
    return [{ user_id: values[0], full_name: "T", verification: "verified", onboarded: true,
      course: null, grad_year: null, student_email: null, student_id: null,
      university_id: null, university_name: null, university_country: null,
      university_city: null, university_custom: false, location: null, bio: null,
      onboarding_step: 0, availability: [], looking_for: [], work_area: "" }];
  if (text.includes("select distinct provider")) return [];
  if (text.includes("select last_seen_at from sessions"))
    return [{ last_seen_at: new Date() }];
  if (text.includes("update sessions set last_seen_at")) return [];
  if (text.includes("delete from user_skills")) {
    const [, keep] = values;
    const keepLc = new Set((keep as string[]).map((s: string) => s.toLowerCase()));
    skillRows = skillRows.filter((r) => keepLc.has(r.skill.toLowerCase()));
    return [];
  }
  if (text.includes("insert into user_skills")) {
    const [, knownList, newSkills] = values as [string, string[], string[]];
    for (const s of newSkills) {
      if (!skillRows.some((r) => r.skill === s)) {
        skillRows.push({ skill: s, custom: !knownList.includes(s) });
      }
    }
    return [];
  }
  return [];
}

function makeSql() {
  // A tagged-template call returns a descriptor that's ALSO awaitable —
  // awaited it applies itself; handed to transaction() it just carries
  // queryData (exactly the neon() contract).
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const qd = { strings: [...strings], values };
    const descriptor = {
      queryData: qd,
      then: (resolve: (v: unknown[]) => void) => {
        const text = qd.strings.join("?").toLowerCase();
        statementLog.push({ text, params: values });
        resolve(apply(text, values));
      },
    };
    return descriptor;
  }) as unknown as {
    (strings: TemplateStringsArray, ...values: unknown[]): unknown;
    query: (text: string, params: unknown[]) => Promise<unknown[]>;
    transaction: (q: { queryData: { strings: string[]; values: unknown[] } }[]) => Promise<void>;
  };
  sql.query = async (text: string, params: unknown[]) => {
    statementLog.push({ text: text.toLowerCase(), params });
    return apply(text.toLowerCase(), params);
  };
  sql.transaction = async (queries: { queryData: { strings: string[]; values: unknown[] } }[]) => {
    for (const q of queries) {
      const text = q.queryData.strings.join("?").toLowerCase();
      statementLog.push({ text, params: q.queryData.values });
      apply(text, q.queryData.values);
    }
  };
  return sql;
}

vi.mock("@/lib/db", () => ({ db: () => makeSql(), databaseConfigured: true }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (cookieJar.has(k) ? { value: cookieJar.get(k) } : undefined),
    set: (k: string, v: string) => cookieJar.set(k, v),
  }),
}));

import { signSession } from "@/lib/session";
import { PUT } from "@/app/api/profile/route";

describe("skills sync — set-based (issue #22)", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret";
    cookieJar.clear(); liveSessions.clear();
    skillRows = [{ skill: "python", custom: false }, { skill: "old-skill", custom: true }];
    statementLog = [];
    liveSessions.add("s1");
    cookieJar.set("earnly_session", signSession("u1", "s1"));
  });

  it("bounded statements: select + transactional delete + insert — no per-row loops", async () => {
    const req = new Request("https://earnly.app/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json", origin: "https://earnly.app" },
      body: JSON.stringify({ skills: ["python", "typescript", "new-tool"] }),
    });
    const res = await PUT(req as never);
    expect(res.status).toBe(200);

    const deletes = statementLog.filter((s) => s.text.includes("delete from user_skills"));
    const inserts = statementLog.filter((s) => s.text.includes("insert into user_skills"));
    expect(deletes.length).toBe(1);          // ONE set-based delete
    expect(inserts.length).toBe(1);          // ONE multi-row insert
    expect(deletes[0].text).toContain("<> all");  // not-in-set semantics
    expect(inserts[0].text).toContain("unnest");  // multi-row
    // And the RESULT is the replace: old-skill gone, additions applied
    // mergeSkills title-cases lowercase custom inputs — assert the
    // canonical forms the route actually persists.
    expect(skillRows.map((r) => r.skill)).toEqual(["python", "Typescript", "New-Tool"]);
  });
});
