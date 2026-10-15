import { describe, expect, it } from "vitest";
import { mapConcurrent } from "@/lib/concurrency";

/**
 * Issue #16 — serial reconcile loops stacked 25 network calls before the
 * dashboard loaded. mapConcurrent bounds it: N at a time, per-row error
 * isolation, every item runs exactly once.
 */
describe("mapConcurrent", () => {
  it("every item runs exactly once, bounded to the limit", async () => {
    let inflight = 0, peak = 0;
    const items = Array.from({ length: 25 }, (_, i) => i);
    const { results } = await mapConcurrent(items, 5, async (i) => {
      inflight++; peak = Math.max(peak, inflight);
      await new Promise((r) => setTimeout(r, 5));
      inflight--;
      return i * 2;
    });
    expect(results).toEqual(items.map((i) => i * 2));
    expect(peak).toBeLessThanOrEqual(5);
    expect(peak).toBeGreaterThan(1);             // actually concurrent
  });

  it("one failure doesn't block or reject the batch", async () => {
    const { results, failures } = await mapConcurrent(
      [1, 2, 3, 4], 2,
      async (i) => { if (i === 2) throw new Error("boom"); return i; },
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].item).toBe(2);
    expect(results.filter((r) => r !== undefined)).toHaveLength(3);
  });

  it("wall-clock beats serial under a 100ms-per-call dep", async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const t0 = Date.now();
    await mapConcurrent(items, 5, async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    const wall = Date.now() - t0;
    // Serial would be ~1000ms; 5-wide ~200ms — assert well under half.
    expect(wall).toBeLessThan(500);
  });
});
