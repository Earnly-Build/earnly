import { findOpportunity } from "./data";
import type { Application, Opportunity, Txn } from "./types";

export interface ReliabilityMetrics {
  repliedWithinDayRate: number;
  repeatPostersRate: number;
}

/**
 * Derives profile reliability bars from actual application and transaction
 * records rather than rendering hardcoded demo percentages on real profiles.
 */
export function deriveReliabilityMetrics(
  applications: Application[],
  txns: Txn[] = [],
  lookupOpportunity: (id: string) => Opportunity | undefined = findOpportunity
): ReliabilityMetrics {
  if (applications.length === 0 && txns.length === 0) {
    return { repliedWithinDayRate: 0, repeatPostersRate: 0 };
  }

  const progressedOrFast = applications.filter(
    (a) => a.updatedDaysAgo <= 1 || a.stage !== "Applied"
  ).length;
  const repliedWithinDayRate =
    applications.length > 0
      ? Math.round((progressedOrFast / applications.length) * 100)
      : 0;

  const orgCounts = new Map<string, number>();
  const seenRecordKeys = new Set<string>();

  for (const app of applications) {
    const opp = lookupOpportunity(app.opportunityId);
    if (!opp?.org) continue;
    const key = `app:${app.id}`;
    if (seenRecordKeys.has(key)) continue;
    seenRecordKeys.add(key);
    orgCounts.set(opp.org, (orgCounts.get(opp.org) ?? 0) + 1);
  }

  for (const tx of txns) {
    if (!tx.opportunityId || tx.kind === "withdrawal") continue;
    const opp = lookupOpportunity(tx.opportunityId);
    if (!opp?.org) continue;
    const key = `tx:${tx.id}`;
    if (seenRecordKeys.has(key)) continue;
    seenRecordKeys.add(key);
    orgCounts.set(opp.org, (orgCounts.get(opp.org) ?? 0) + 1);
  }

  const totalOrgs = orgCounts.size;
  if (totalOrgs === 0) {
    return { repliedWithinDayRate, repeatPostersRate: 0 };
  }

  let repeatOrgs = 0;
  for (const count of orgCounts.values()) {
    if (count >= 2) repeatOrgs += 1;
  }

  const repeatPostersRate = Math.round((repeatOrgs / totalOrgs) * 100);
  return { repliedWithinDayRate, repeatPostersRate };
}
