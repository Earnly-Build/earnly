import { describe, expect, it } from "vitest";
import { loadPersisted, serializePersisted, SCHEMA_VERSION } from "@/lib/store";

/**
 * Issue #27 — the persisted blob was spread into state unversioned:
 * corrupt JSON threw, old shapes mixed into new, and nothing discarded
 * future payloads. Now the envelope carries a version.
 */
describe("persisted store versioning", () => {
  it("round-trips: save → load returns the same state", () => {
    const fresh = loadPersisted(null);
    const saved = serializePersisted({ ...fresh, theme: "dark", signedIn: true });
    const back = loadPersisted(saved);
    expect(back.theme).toBe("dark");
    expect(back.signedIn).toBe(true);
  });

  it("corrupt JSON falls back to defaults without throwing", () => {
    expect(() => loadPersisted("{not json")).not.toThrow();
    expect(loadPersisted("{not json")).toEqual(loadPersisted(null));
    expect(loadPersisted("42")).toEqual(loadPersisted(null));
  });

  it("a pre-envelope (v0) payload migrates forward", () => {
    // The old unversioned shape — a bare Persisted object.
    const v0 = { theme: "dark", signedIn: true, onboarded: true };
    const out = loadPersisted(JSON.stringify(v0));
    expect(out.theme).toBe("dark");
    expect(out.signedIn).toBe(true);
    expect(out.onboarded).toBe(true);
  });

  it("a future-version payload is discarded, not half-applied", () => {
    const future = JSON.stringify({ v: SCHEMA_VERSION + 5, data: { theme: "dark" } });
    expect(loadPersisted(future)).toEqual(loadPersisted(null));
  });

  it("a v-current envelope loads its data", () => {
    const env = JSON.stringify({ v: SCHEMA_VERSION, data: { theme: "dark" } });
    expect(loadPersisted(env).theme).toBe("dark");
  });
});
