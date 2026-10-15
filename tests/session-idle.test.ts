import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for Issue #24: Bump sessions.last_seen_at on use and support idle expiry.
 */

interface MockSession {
  id: string;
  user_id: string;
  created_at: Date;
  last_seen_at: Date;
  user_agent: string | null;
}

const mockSessions = new Map<string, MockSession>();
let updateCount = 0;
let deleteCount = 0;

vi.mock("@/lib/db", () => {
  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const raw = strings.join(" ? ").toLowerCase().replace(/\s+/g, " ");

    if (raw.includes("insert into sessions")) {
      const [userId, userAgent] = values as [string, string | null];
      const id = "sess-" + (mockSessions.size + 1);
      const row: MockSession = {
        id,
        user_id: userId,
        created_at: new Date(),
        last_seen_at: new Date(),
        user_agent: userAgent,
      };
      mockSessions.set(id, row);
      return Promise.resolve([{ id }]);
    }

    if (raw.includes("select id, user_id, created_at, last_seen_at")) {
      if (raw.includes("where id = ?")) {
        const [sid, userId] = values as [string, string];
        const s = mockSessions.get(sid);
        if (s && s.user_id === userId) return Promise.resolve([s]);
        return Promise.resolve([]);
      }
      const [userId] = values as [string];
      const matches = Array.from(mockSessions.values()).filter((s) => s.user_id === userId);
      matches.sort((a, b) => b.last_seen_at.getTime() - a.last_seen_at.getTime());
      return Promise.resolve(matches.slice(0, 1));
    }

    if (raw.includes("update sessions set last_seen_at")) {
      updateCount++;
      const [sid] = values as [string];
      const s = mockSessions.get(sid);
      if (s) {
        s.last_seen_at = new Date();
      }
      return Promise.resolve([]);
    }

    if (raw.includes("delete from sessions where id = ?")) {
      deleteCount++;
      const [sid] = values as [string];
      mockSessions.delete(sid);
      return Promise.resolve([]);
    }

    if (raw.includes("update users set last_login_at")) {
      return Promise.resolve([]);
    }

    return Promise.resolve([]);
  };

  return {
    databaseConfigured: true,
    db: () => sql,
  };
});

process.env.AUTH_SECRET = "test-secret-at-least-32-bytes-long-1234567890";

const {
  touchSession,
  signSession,
  parseSessionToken,
  IDLE_WINDOW_SECONDS,
  THROTTLE_SECONDS,
} = await import("@/lib/session");

beforeEach(() => {
  mockSessions.clear();
  updateCount = 0;
  deleteCount = 0;
});

describe("Session idle expiry and throttled last_seen_at updates", () => {
  it("advances last_seen_at when the throttle window has elapsed", async () => {
    expect(THROTTLE_SECONDS).toBe(60);
    expect(IDLE_WINDOW_SECONDS).toBe(60 * 60 * 24 * 7);
    const now = Date.now();
    // Session last seen 5 minutes ago (300s > THROTTLE_SECONDS 60s)
    const fiveMinutesAgo = new Date(now - 300 * 1000);
    mockSessions.set("sess-1", {
      id: "sess-1",
      user_id: "user-1",
      created_at: fiveMinutesAgo,
      last_seen_at: fiveMinutesAgo,
      user_agent: "test-agent",
    });

    const active = await touchSession("user-1", "sess-1");
    expect(active).toBe(true);
    expect(updateCount).toBe(1);
    expect(mockSessions.get("sess-1")!.last_seen_at.getTime()).toBeGreaterThan(fiveMinutesAgo.getTime());
  });

  it("does not write on hot paths within the throttle window (bounded queries)", async () => {
    const now = Date.now();
    // Session last seen 20 seconds ago (< THROTTLE_SECONDS 60s)
    const twentySecsAgo = new Date(now - 20 * 1000);
    mockSessions.set("sess-2", {
      id: "sess-2",
      user_id: "user-2",
      created_at: twentySecsAgo,
      last_seen_at: twentySecsAgo,
      user_agent: "test-agent",
    });

    const active = await touchSession("user-2", "sess-2");
    expect(active).toBe(true);
    // Crucial: no DB write amplification inside throttle window!
    expect(updateCount).toBe(0);
    expect(mockSessions.get("sess-2")!.last_seen_at.getTime()).toBe(twentySecsAgo.getTime());
  });

  it("rejects an idle session older than 7 days and deletes its row", async () => {
    const now = Date.now();
    // Session last seen 8 days ago (> IDLE_WINDOW_SECONDS 7 days)
    const eightDaysAgo = new Date(now - (IDLE_WINDOW_SECONDS + 3600) * 1000);
    mockSessions.set("sess-3", {
      id: "sess-3",
      user_id: "user-3",
      created_at: eightDaysAgo,
      last_seen_at: eightDaysAgo,
      user_agent: "test-agent",
    });

    const active = await touchSession("user-3", "sess-3");
    expect(active).toBe(false);
    expect(deleteCount).toBe(1);
    // Row removed from database
    expect(mockSessions.has("sess-3")).toBe(false);
  });

  it("rejects non-existent session records", async () => {
    const active = await touchSession("unknown-user", "unknown-session");
    expect(active).toBe(false);
  });

  it("parses sid from modern token and preserves backwards compatibility", () => {
    const tokenWithSid = signSession("user-10", "sess-10");
    const parsedWithSid = parseSessionToken(tokenWithSid);
    expect(parsedWithSid).not.toBeNull();
    expect(parsedWithSid?.uid).toBe("user-10");
    expect(parsedWithSid?.sid).toBe("sess-10");

    const tokenWithoutSid = signSession("user-11");
    const parsedWithoutSid = parseSessionToken(tokenWithoutSid);
    expect(parsedWithoutSid).not.toBeNull();
    expect(parsedWithoutSid?.uid).toBe("user-11");
    expect(parsedWithoutSid?.sid).toBeUndefined();
  });
});
