import { describe, expect, it } from "vitest";
import { loadPersisted, PERSISTED_VERSION, serializePersisted } from "@/lib/persistence";
import type { Persisted } from "@/lib/persistence";

const defaults: Persisted = {
  signedIn: false, authMethod: null, verification: "required", onboarded: false,
  prefs: { skills: [], kinds: [], tasks: [], radius: "Anywhere", minPay: 0,
    payType: "any", availability: [] },
  aiPrefs: { skills: [], kinds: [], tasks: [], radius: "Anywhere", minPay: 0,
    payType: "any", availability: [] },
  saved: ["demo"], applications: [], notifications: [], theme: "light",
};

const saved: Persisted = {
  ...defaults, signedIn: true, authMethod: "email", verification: "pending",
  onboarded: true, theme: "dark", saved: ["task-1", "task-2"],
  prefs: { ...defaults.prefs, skills: ["Writing"], minPay: 25 },
  aiPrefs: { ...defaults.aiPrefs, radius: "Remote", availability: ["Evenings"] },
  applications: [{ id: "a1", opportunityId: "task-1", stage: "Applied", updatedDaysAgo: 1,
    demoEscrow: true }],
  notifications: [{ id: "n1", kind: "application", title: "Applied", body: "Demo",
    ago: "Today", unread: false }],
};

describe("versioned prototype persistence", () => {
  it("writes a versioned envelope and round-trips the entire persisted slice", () => {
    const raw = serializePersisted(saved);
    expect(JSON.parse(raw)).toEqual({ v: PERSISTED_VERSION, data: saved });
    expect(loadPersisted(raw, defaults)).toEqual(saved);
  });

  it.each([null, "", "{", "not JSON", "null", "[]", "false", "42"])(
    "starts fresh for missing or corrupt input %j", (raw) => {
      expect(() => loadPersisted(raw, defaults)).not.toThrow();
      expect(loadPersisted(raw, defaults)).toBe(defaults);
    }
  );

  it("migrates the old flat store to v1 without losing demo work", () => {
    const migrated = loadPersisted(JSON.stringify(saved), defaults);
    expect(migrated).toEqual(saved);
    expect(JSON.parse(serializePersisted(migrated))).toEqual({ v: 1, data: saved });
  });

  it("migrates explicit v0 envelopes and fills missing legacy fields", () => {
    expect(loadPersisted(JSON.stringify({ v: 0, data: { theme: "dark", saved: [] } }), defaults))
      .toEqual({ ...defaults, theme: "dark", saved: [] });
    expect(loadPersisted(JSON.stringify({ theme: "dark" }), defaults))
      .toEqual({ ...defaults, theme: "dark" });
  });

  it.each([2, 99, -1, "1", null, false, 0.5])("discards unsupported version %j in full", (v) => {
    expect(loadPersisted(JSON.stringify({ v, data: saved, theme: "dark" }), defaults))
      .toBe(defaults);
  });

  it.each([null, [], {}, { theme: "dark" }])("rejects malformed v1 data %j", (data) => {
    expect(loadPersisted(JSON.stringify({ v: 1, data }), defaults)).toBe(defaults);
  });

  it.each([
    { saved: [null] }, { applications: [null] }, { notifications: [null] },
    { theme: "unknown" }, { signedIn: "true" }, { authMethod: "unknown" },
    { verification: "unknown" }, { prefs: null },
    { aiPrefs: { ...defaults.aiPrefs, minPay: "25" } },
    { applications: [{ ...saved.applications[0], stage: "Unknown" }] },
    { notifications: [{ ...saved.notifications[0], unread: "false" }] },
  ])("rejects structurally invalid state instead of partially hydrating %j", (patch) => {
    for (const payload of [{ ...saved, ...patch }, { v: 1, data: { ...saved, ...patch } }]) {
      expect(loadPersisted(JSON.stringify(payload), defaults)).toBe(defaults);
    }
  });

  it("does not carry obsolete root fields into state or the next save", () => {
    for (const payload of [{ ...saved, obsolete: true }, { v: 1, data: { ...saved, obsolete: true } }]) {
      const state = loadPersisted(JSON.stringify(payload), defaults);
      expect(state).toEqual(saved);
      expect(serializePersisted(state)).not.toContain("obsolete");
    }
    expect(serializePersisted({ ...saved, obsolete: true } as Persisted)).not.toContain("obsolete");
  });

  it("leaves defaults unchanged across migrations and rejected loads", () => {
    const before = JSON.stringify(defaults);
    loadPersisted(JSON.stringify(saved), defaults);
    loadPersisted(JSON.stringify({ v: 99, data: saved }), defaults);
    expect(JSON.stringify(defaults)).toBe(before);
    expect(loadPersisted(serializePersisted(defaults), defaults)).toEqual(defaults);
  });
});
