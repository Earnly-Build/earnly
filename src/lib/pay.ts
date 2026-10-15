import type { PayUnit } from "./types";

/**
 * Pay normalization — one comparable unit for filter, sort and AI prefs.
 *
 * Canonical unit: USD-equivalent PER WEEK. Assumptions (documented):
 *   - "per hour"  → amount × 40 hours  (a full-time week)
 *   - "per week"  → amount             (already weekly)
 *   - "per month" → amount / 4.33      (52 weeks / 12 months)
 *   - "fixed"     → amount             (one-off payout compares raw —
 *                                       the whole sum lands at once)
 *
 * So a browse chip "Minimum pay 50+" means: the opportunity's weekly-
 * equivalent value is ≥ $50. A $15/hr role ≈ $600/wk passes; a $500/mo
 * internship ≈ $115/wk passes; a $150 fixed gig passes "100+". Displayed
 * labels stay untouched — only comparisons normalize.
 */
export function weeklyEquivalent(pay: { amount: number; unit: PayUnit }): number {
  switch (pay.unit) {
    case "per hour":
      return pay.amount * 40;
    case "per month":
      return pay.amount / 4.33;
    case "per week":
      return pay.amount;
    case "fixed":
      return pay.amount;
  }
}
