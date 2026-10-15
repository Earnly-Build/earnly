/**
 * Bounded concurrency over a list — the pooled-map pattern (issue #16).
 * Runs at most `limit` items at once; per-item errors are collected into
 * the result (the caller decides which failures matter) instead of
 * rejecting the whole batch.
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<{ results: R[]; failures: { item: T; error: unknown }[] }> {
  const results: R[] = new Array(items.length);
  const failures: { item: T; error: unknown }[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = await fn(items[i]);
      } catch (error) {
        failures.push({ item: items[i], error });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return { results, failures };
}
