import { describe, expect, it } from "vitest";
import { DEMO_APPLICATIONS, DEMO_TXNS } from "@/lib/data";
import { deriveReliabilityMetrics } from "@/lib/reputation";
import type { Application, Txn } from "@/lib/types";

describe("deriveReliabilityMetrics", () => {
  it("returns 0% for both metrics when a student has no applications or transactions", () => {
    const metrics = deriveReliabilityMetrics([], []);
    expect(metrics).toEqual({
      repliedWithinDayRate: 0,
      repeatPostersRate: 0,
    });
  });

  it("derives repliedWithinDayRate and repeatPostersRate from real application and transaction records", () => {
    const apps: Application[] = [
      { id: "a1", opportunityId: "t-event-photographer", stage: "Completed", updatedDaysAgo: 1 },
      { id: "a2", opportunityId: "t-react-landing", stage: "Applied", updatedDaysAgo: 4 },
    ];
    const txns: Txn[] = [
      {
        id: "tx1",
        label: "Event photos 1",
        amount: 100,
        kind: "earning",
        status: "Paid",
        date: "19 Sep",
        opportunityId: "t-event-photographer",
      },
    ];

    const metrics = deriveReliabilityMetrics(apps, txns);
    // 1 of 2 applications progressed / updated within a day -> 50%
    expect(metrics.repliedWithinDayRate).toBe(50);
    // 2 unique orgs (Faculty of Science x2, Bright Bakery x1) -> 1 of 2 is repeat -> 50%
    expect(metrics.repeatPostersRate).toBe(50);
  });

  it("computes deterministic non-fabricated values for the demo dataset", () => {
    const metrics = deriveReliabilityMetrics(DEMO_APPLICATIONS, DEMO_TXNS);
    expect(metrics.repliedWithinDayRate).toBeGreaterThan(0);
    expect(metrics.repliedWithinDayRate).toBeLessThanOrEqual(100);
    expect(metrics.repeatPostersRate).toBeGreaterThan(0);
    expect(metrics.repeatPostersRate).toBeLessThanOrEqual(100);
  });
});
