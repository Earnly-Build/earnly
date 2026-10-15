import { describe, expect, it } from "vitest";
import { weeklyEquivalent } from "@/lib/pay";

/**
 * Issue #6 — pay units mixed raw: a $15/hr role hid from the "50+" chip
 * while a $500/mo internship outranked a $150 fixed gig. Filter, sort and
 * AI prefs now compare weekly-equivalent USD. These pin the boundaries.
 */
describe("weeklyEquivalent", () => {
  it("per hour → ×40 (full-time week)", () => {
    expect(weeklyEquivalent({ amount: 15, unit: "per hour" })).toBe(600);
    expect(weeklyEquivalent({ amount: 0.5, unit: "per hour" })).toBe(20);
  });

  it("per week → identity", () => {
    expect(weeklyEquivalent({ amount: 200, unit: "per week" })).toBe(200);
  });

  it("per month → ÷4.33 (52 weeks / 12 months)", () => {
    expect(weeklyEquivalent({ amount: 500, unit: "per month" })).toBeCloseTo(115.5, 0);
  });

  it("fixed → the whole payout compares raw", () => {
    expect(weeklyEquivalent({ amount: 150, unit: "fixed" })).toBe(150);
  });
});

describe("filter boundaries — the acceptance cases", () => {
  const meets = (pay: { amount: number; unit: "fixed" | "per hour" | "per week" | "per month" }, min: number) =>
    weeklyEquivalent(pay) >= min;

  it("$15/hr is visible at the 50+ chip (was hidden before)", () => {
    expect(meets({ amount: 15, unit: "per hour" }, 50)).toBe(true);
  });

  it("$500/mo is visible at 50+, hidden at 100+ (≈$115/wk)", () => {
    const p = { amount: 500, unit: "per month" as const };
    expect(meets(p, 50)).toBe(true);
    expect(meets(p, 100)).toBe(true);
    expect(meets(p, 120)).toBe(false);
  });

  it("$150 fixed passes 100+, fails 200+", () => {
    const p = { amount: 150, unit: "fixed" as const };
    expect(meets(p, 100)).toBe(true);
    expect(meets(p, 200)).toBe(false);
  });

  it("the boundary is inclusive — exactly 25/wk passes the 25+ chip", () => {
    expect(meets({ amount: 25, unit: "per week" }, 25)).toBe(true);
    expect(meets({ amount: 24.99, unit: "per week" }, 25)).toBe(false);
  });
});
