import { OPPORTUNITIES } from "./data";
import type { AiPrefs, AiResult, Opportunity } from "./types";

/**
 * Opportunity discovery, stubbed.
 *
 * The real system is meant to be a pipeline — Discover → Filter → Rank →
 * Explain → Link — over sources that permit reading (public job boards,
 * company career pages, campus boards, approved partner APIs). Nothing here
 * performs a web search: `runSearch` ranks the local demo dataset and says so
 * on screen. Swapping in a real provider means replacing this one function
 * and giving each source an adapter behind `SourceAdapter`.
 */
export interface SourceAdapter {
  id: string;
  /** Must only read sources whose terms and robots rules allow it. */
  fetch(query: SourceQuery): Promise<RawListing[]>;
}

export interface SourceQuery {
  skills: string[];
  keywords: string[];
  location: string;
  radiusKm: number | null;
  remote: boolean;
}

export interface RawListing {
  title: string;
  org: string;
  url: string;
  pay: string;
  location: string;
  postedAt: string;
  description: string;
}

export const SEARCH_STAGES = [
  "Understanding your skills",
  "Searching opportunity sources",
  "Filtering what does not fit",
  "Ranking by match",
  "Writing why each one matches",
] as const;

export const RADIUS_OPTIONS = [
  "On campus",
  "Within 1 km",
  "Within 5 km",
  "Within 10 km",
  "My city",
  "Remote",
  "Anywhere",
];

export const KIND_OPTIONS = [
  "Small paid tasks",
  "Freelance gigs",
  "Remote jobs",
  "Local jobs",
  "Part-time jobs",
  "Internships",
  "One-time work",
  "Recurring work",
];

export const PAY_OPTIONS = [0, 10, 25, 50, 100];

export const AVAILABILITY_OPTIONS = [
  "Today",
  "Tomorrow",
  "This week",
  "Weekends",
  "Evenings",
  "Flexible",
];

export const DEFAULT_PREFS: AiPrefs = {
  skills: [],
  kinds: [],
  tasks: [],
  radius: "Anywhere",
  minPay: 0,
  payType: "any",
  availability: [],
};

function payMeetsPrefs(o: Opportunity, prefs: AiPrefs) {
  if (prefs.minPay <= 0) return true;
  return weeklyEquivalent(o.pay) >= prefs.minPay;
}

function radiusMeetsPrefs(o: Opportunity, prefs: AiPrefs) {
  if (prefs.radius === "Anywhere" || prefs.radius === "Remote") return true;
  if (prefs.radius === "On campus") return o.mode === "On campus";
  return o.mode !== "Remote" || prefs.radius === "My city";
}

function kindMeetsPrefs(o: Opportunity, prefs: AiPrefs) {
  if (prefs.kinds.length === 0) return true;
  const k = prefs.kinds;
  if (o.kind === "internship") return k.includes("Internships");
  if (o.kind === "job") {
    return k.some((x) =>
      ["Remote jobs", "Local jobs", "Part-time jobs"].includes(x)
    );
  }
  return k.some((x) =>
    ["Small paid tasks", "Freelance gigs", "One-time work", "Recurring work"].includes(x)
  );
}

/** Deterministic demo ranking. Not a real search, and labelled as such in the UI. */
export function runSearch(prefs: AiPrefs): AiResult[] {
  const wanted = new Set(prefs.skills.map((s) => s.toLowerCase()));

  const scored = OPPORTUNITIES.filter(
    (o) => kindMeetsPrefs(o, prefs) && payMeetsPrefs(o, prefs) && radiusMeetsPrefs(o, prefs)
  ).map((o) => {
    const skillsMatched = o.skills.filter((s) => wanted.has(s.toLowerCase()));
    let score = o.match;

    if (wanted.size > 0) {
      score += skillsMatched.length * 6;
      if (skillsMatched.length === 0) score -= 18;
    }
    if (prefs.radius === "On campus" && o.mode === "On campus") score += 4;
    if (prefs.radius === "Remote" && o.mode === "Remote") score += 4;
    if (prefs.payType === "fixed" && o.pay.unit === "fixed") score += 3;
    if (prefs.payType === "hourly" && o.pay.unit === "per hour") score += 3;

    score = Math.max(38, Math.min(98, Math.round(score)));

    const why: string[] = [];
    if (skillsMatched.length) why.push(`Matches your ${skillsMatched.join(" and ")} skill`);
    if (o.mode === "Remote") why.push("Remote, so it fits around lectures");
    if (o.mode === "On campus") why.push("On campus, walk there between classes");
    if (prefs.minPay > 0 && weeklyEquivalent(o.pay) >= prefs.minPay)
      why.push(`Pays above your ${prefs.minPay} minimum`);
    if (prefs.availability.includes("Weekends") && /saturday|weekend/i.test(o.description))
      why.push("Happens at the weekend");
    if (o.kind === "internship") why.push("Internship: converts to real experience");
    if (why.length === 0) why.push("Close to your saved preferences");

    return { ...o, match: score, why: why.slice(0, 4), skillsMatched };
  });

  return scored
    .sort((a, b) => b.match - a.match)
    .filter((r) => (wanted.size ? r.match >= 45 : true))
    .slice(0, 8);
}
