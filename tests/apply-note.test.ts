import { describe, expect, it } from "vitest";
import { buildApplication, NOTE_MAX } from "@/lib/store";

/**
 * Issue #25 — the apply modal collected a note into state then dropped it:
 * apply(o.id) accepted only the opportunity id. These tests pin the fix:
 * the note persists on the application record and stays inside its cap.
 */
describe("apply note persistence", () => {
  it("stores the note on the application record", () => {
    const a = buildApplication("opp-1", "I can do this — free weekends");
    expect(a.opportunityId).toBe("opp-1");
    expect(a.note).toBe("I can do this — free weekends");
    expect(a.stage).toBe("Applied");
    expect(a.id).toMatch(/^a\d+/);
  });

  it("leaves note unset when empty — identical to the old record shape", () => {
    const a = buildApplication("opp-1");
    expect(a).not.toHaveProperty("note");
    const b = buildApplication("opp-1", "");
    expect(b).not.toHaveProperty("note");
  });

  it("truncates a note past NOTE_MAX instead of rejecting", () => {
    const long = "x".repeat(NOTE_MAX + 200);
    const a = buildApplication("opp-1", long);
    expect(a.note).toHaveLength(NOTE_MAX);
    // Truncation is the documented choice: the apply flow never rejects a
    // submission over a note-length edge — the note is best-effort context.
  });

  it("keeps a note at exactly NOTE_MAX untouched", () => {
    const exact = "y".repeat(NOTE_MAX);
    expect(buildApplication("opp-1", exact).note).toBe(exact);
  });
});
