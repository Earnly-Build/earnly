"use client";

import { useMemo, useState } from "react";
import { CATEGORIES, OPPORTUNITIES } from "@/lib/data";
import { useApp } from "@/lib/store";
import type { Opportunity, OpportunityKind, WorkMode } from "@/lib/types";
import { OpportunityCard } from "./cards";
import { Button, EmptyState, Icon, Tag } from "./ui";
import { weeklyEquivalent } from "@/lib/pay";

type Sort = "match" | "newest" | "pay";

const MODE_FILTERS: (WorkMode | "All")[] = ["All", "Remote", "On campus", "Local", "Hybrid"];

export function Browse({
  kind,
  intro,
  title,
}: {
  kind: OpportunityKind;
  title: string;
  intro: string;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("All");
  const [mode, setMode] = useState<WorkMode | "All">("All");
  const [minPay, setMinPay] = useState(0);
  const [sort, setSort] = useState<Sort>("match");
  const [savedOnly, setSavedOnly] = useState(false);
  const [visible, setVisible] = useState(6);
  const { saved } = useApp();

  const pool = useMemo(() => OPPORTUNITIES.filter((o) => o.kind === kind), [kind]);

  const cats = useMemo(() => {
    const used = new Set(pool.map((o) => o.category));
    return ["All", ...CATEGORIES.filter((c) => used.has(c))];
  }, [pool]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    let out = pool.filter((o) => {
      if (cat !== "All" && o.category !== cat) return false;
      if (mode !== "All" && o.mode !== mode) return false;
      if (minPay > 0 && weeklyEquivalent(o.pay) < minPay) return false;
      if (savedOnly && !saved.includes(o.id)) return false;
      if (t && !`${o.title} ${o.org} ${o.skills.join(" ")} ${o.summary}`.toLowerCase().includes(t))
        return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === "match") return b.match - a.match;
      if (sort === "newest") return a.postedDaysAgo - b.postedDaysAgo;
      return weeklyEquivalent(b.pay) - weeklyEquivalent(a.pay);
    });
    return out;
  }, [pool, q, cat, mode, minPay, sort, savedOnly, saved]);

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-6">
        <span className="eyebrow">Browse</span>
        <h1 className="display mt-2 text-[36px] sm:text-[46px]">{title}</h1>
        <p className="mt-3 max-w-[62ch] text-[14.5px] leading-relaxed text-ink2">{intro}</p>
      </header>

      {/* filter bar */}
      <div className="tagshape mb-5 border border-rule bg-raised p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-full border border-rule px-3.5 py-2">
            <Icon name="search" size={16} className="text-ink3" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setVisible(6);
              }}
              placeholder="Search by role, skill or who posted it"
              className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-ink3"
            />
            {q ? (
              <button onClick={() => setQ("")} aria-label="Clear search">
                <Icon name="x" size={14} className="text-ink3" />
              </button>
            ) : null}
          </label>

          <select
            aria-label="Sort by"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-full border border-rule bg-transparent px-3.5 py-2 text-[13px] text-ink2 outline-none"
          >
            <option value="match">Best match</option>
            <option value="newest">Newest first</option>
            <option value="pay">Highest pay</option>
          </select>

          <button
            onClick={() => setSavedOnly((v) => !v)}
            aria-pressed={savedOnly}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition-colors ${
              savedOnly ? "border-accent bg-accent/15 text-accentx" : "border-rule text-ink2"
            }`}
          >
            <Icon name="bookmark" size={15} filled={savedOnly} />
            Saved
          </button>
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {MODE_FILTERS.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              aria-label={m === "All" ? "All work modes" : undefined}
              className={`flex-none rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                mode === m ? "border-accent bg-accent text-onaccent" : "border-rule text-ink2"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              aria-pressed={cat === c}
              aria-label={c === "All" ? "All categories" : undefined}
              className={`rounded-full px-2.5 py-1 text-[11.5px] transition-colors ${
                cat === c ? "bg-ink text-ground" : "text-ink3 hover:text-ink"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-rule pt-3 text-[12.5px] text-ink3">
          <span className="inline-flex items-center gap-2">
            <Icon name="filter" size={14} />
            Minimum pay
          </span>
          {[0, 25, 50, 100].map((p) => (
            <button
              key={p}
              onClick={() => setMinPay(p)}
              aria-pressed={minPay === p}
              aria-label={p === 0 ? "Any minimum pay" : `Minimum pay ${p}+`}
              className={`rounded-full px-2.5 py-1 font-semibold transition-colors ${
                minPay === p ? "bg-accent/20 text-accentx" : "hover:text-ink"
              }`}
            >
              {p === 0 ? "Any" : `${p}+`}
            </button>
          ))}
          <span className="ml-auto figure">
            {results.length} result{results.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {results.length === 0 ? (
        <EmptyState
          title="Nothing matches those filters"
          body="Try widening the pay range, switching to Any mode, or clearing the category. New listings appear most mornings."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQ("");
                setCat("All");
                setMode("All");
                setMinPay(0);
                setSavedOnly(false);
                setSort("match");
                setVisible(6);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {results.slice(0, visible).map((o) => (
              <OpportunityCard key={o.id} o={o} compact />
            ))}
          </div>
          {visible < results.length ? (
            <div className="mt-6 text-center">
              <Button variant="outline" onClick={() => setVisible((v) => v + 6)}>
                Show more ({results.length - visible} left)
              </Button>
            </div>
          ) : null}
        </>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-2 border-t border-rule pt-6">
        <span className="eyebrow mr-2">Also on Earnly</span>
        {(kind !== "task" ? [{ h: "/app/tasks", l: "Tasks" }] : [])
          .concat(kind !== "job" ? [{ h: "/app/jobs", l: "Jobs" }] : [])
          .concat(kind !== "internship" ? [{ h: "/app/internships", l: "Internships" }] : [])
          .map((x) => (
            <a key={x.h} href={x.h} className="rounded-full border border-rule px-3 py-1.5 text-[12.5px] text-ink2">
              {x.l}
            </a>
          ))}
        <Tag tone="quiet">Everything is demo data for now</Tag>
      </div>
    </div>
  );
}

export type { Sort };
export type { Opportunity };
