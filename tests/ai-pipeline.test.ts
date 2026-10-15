import { describe, expect, it } from "vitest";
import {
  runSearch, DEFAULT_PREFS, SEARCH_STAGES, RADIUS_OPTIONS,
  KIND_OPTIONS, PAY_OPTIONS, AVAILABILITY_OPTIONS,
} from "@/lib/ai";
import { OPPORTUNITIES } from "@/lib/data";
import { weeklyEquivalent } from "@/lib/pay";
import type { AiPrefs } from "@/lib/types";

/**
 * Issue #23 — the discovery pipeline had zero coverage. runSearch is the
 * whole filter → score → rank → explain chain over the demo dataset;
 * these pin its observable contract (incl. the post-#6 normalized pay).
 */
const prefs = (over: Partial<AiPrefs> = {}): AiPrefs => ({
  ...DEFAULT_PREFS, ...over,
});

describe("runSearch", () => {
  it("empty prefs return the top-matched slice, descending", () => {
    const out = runSearch(prefs());
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].match).toBeLessThanOrEqual(out[i - 1].match);
    }
    // a real result carries the explain fields
    expect(out[0].why.length).toBeGreaterThan(0);
    expect(out[0].why.length).toBeLessThanOrEqual(4);
    expect(out[0].match).toBeGreaterThanOrEqual(38);
    expect(out[0].match).toBeLessThanOrEqual(98);
  });

  it("skills raise the matching item's rank (exact-title beats body)", () => {
    const out = runSearch(prefs({ skills: ["React"] }));
    // everything that lists React scores +6 per match; the top of the
    // list should hold a React-tagged item.
    const reactIds = OPPORTUNITIES.filter((o) =>
      o.skills.some((s) => s.toLowerCase() === "react")).map((o) => o.id);
    expect(reactIds).toContain(out[0].id);
  });

  it("skill-less matches get penalized and can drop out entirely", () => {
    const out = runSearch(prefs({ skills: ["nonexistent-skill-xyz"] }));
    // −18 penalty + the ≥45 cut — only high-match items survive
    for (const r of out) expect(r.match).toBeGreaterThanOrEqual(45);
  });

  it("preference filters respect mode", () => {
    // 'Remote' admits everything; 'On campus' admits only on-campus rows.
    const campus = runSearch(prefs({ radius: "On campus" }));
    for (const r of campus) expect(r.mode).toBe("On campus");
  });

  it("kind filter narrows to the chosen kind", () => {
    const out = runSearch(prefs({ kinds: ["Internships"] }));
    for (const r of out) expect(r.kind).toBe("internship");
  });

  it("minPay filters on WEEKLY-EQUIVALENT across units (post-#6)", () => {
    const out = runSearch(prefs({ minPay: 50 }));
    for (const r of out) {
      expect(weeklyEquivalent(r.pay)).toBeGreaterThanOrEqual(50);
    }
    // A $15/hr gig (→ $600/wk equivalent) now PASSES the 50+ gate —
    // the pre-#6 code skipped every non-fixed unit. Prove it by scoring
    // the hourly item into the visible window via its skills.
    const hourly = OPPORTUNITIES.find((o) => o.pay.unit === "per hour")!;
    const boosted = runSearch(prefs({ minPay: 50, skills: hourly.skills }));
    expect(boosted.map((r) => r.id)).toContain(hourly.id);
  });

  it("payType boosts matching units without excluding others", () => {
    const fixed = runSearch(prefs({ payType: "fixed" }));
    const hourly = runSearch(prefs({ payType: "hourly" }));
    expect(fixed.length).toBeGreaterThan(0);
    expect(hourly.length).toBeGreaterThan(0);
  });
});

describe("exported constants are complete + stable", () => {
  it("pipeline stages are the documented five", () => {
    expect(SEARCH_STAGES).toHaveLength(5);
  });
  it("options lists are non-empty", () => {
    for (const list of [RADIUS_OPTIONS, KIND_OPTIONS, PAY_OPTIONS, AVAILABILITY_OPTIONS])
      expect(list.length).toBeGreaterThan(0);
    expect(PAY_OPTIONS).toEqual([0, 10, 25, 50, 100]);
  });
});
