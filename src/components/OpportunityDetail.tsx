"use client";

import Link from "next/link";
import { useState } from "react";
import { OPPORTUNITIES, findOpportunity } from "@/lib/data";
import {useApp, NOTE_MAX} from "@/lib/store";
import { deadlineIn, postedAgo } from "@/lib/format";
import {
  Button,
  EmptyState,
  Icon,
  MatchPill,
  Modal,
  Money,
  SectionHeading,
  Tag,
  VerifiedBadge,
} from "./ui";
import { OpportunityCard, payLabel } from "./cards";

const BACK: Record<string, { href: string; label: string }> = {
  task: { href: "/app/tasks", label: "All tasks" },
  job: { href: "/app/jobs", label: "All jobs" },
  internship: { href: "/app/internships", label: "All internships" },
};

export function OpportunityDetail({ id }: { id: string }) {
  const o = findOpportunity(id);
  const { applications, apply } = useApp();
  const [openApply, setOpenApply] = useState(false);
  const [note, setNote] = useState("");

  if (!o) {
    return (
      <div className="mx-auto max-w-[760px]">
        <EmptyState
          title="This listing is no longer open"
          body="It may have been filled or taken down. There are similar opportunities in the same category."
          action={
            <Button href={BACK.task.href} variant="outline">
              Back to browsing
            </Button>
          }
        />
      </div>
    );
  }

  const existing = applications.find((a) => a.opportunityId === o.id);
  const back = BACK[o.kind];
  const similar = OPPORTUNITIES.filter((x) => x.id !== o.id && x.category === o.category).slice(0, 3);
  const fallback = OPPORTUNITIES.filter((x) => x.id !== o.id).slice(0, 3);
  const alsoLike = similar.length ? similar : fallback;

  return (
    <div className="mx-auto max-w-[1180px]">
      <Link
        href={back.href}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink2 hover:text-ink"
      >
        <Icon name="arrowLeft" size={15} />
        {back.label}
      </Link>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        {/* ------------------------------------------------------ main */}
        <article>
          <div className="tagshape border border-rule bg-raised p-6 sm:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow">{o.category}</span>
              {o.urgent ? (
                <span className="rounded-full bg-negative/15 px-2 py-0.5 text-[10.5px] font-bold text-negative">
                  Urgent
                </span>
              ) : null}
              <MatchPill value={o.match} />
            </div>

            <h1 className="display mt-4 text-[32px] leading-[1.02] sm:text-[42px]">{o.title}</h1>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-ink2">
              <span className="inline-flex items-center gap-2">
                <Icon name="user" size={15} />
                {o.org}
                <span className="text-ink3">· {o.orgKind}</span>
              </span>
              <span className="inline-flex items-center gap-2">
                <Icon name="pin" size={15} />
                {o.location}
              </span>
              <span className="inline-flex items-center gap-2">
                <Icon name="clock" size={15} />
                {postedAgo(o.postedDaysAgo)}
              </span>
            </div>

            <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4 border-t border-rule pt-6">
              <div>
                <div className="eyebrow mb-1">Pay</div>
                <Money amount={o.pay.amount} className="text-[26px]" />
                <div className="text-[12px] text-ink3">{payLabel(o).replace("/", "per ")}</div>
              </div>
              <div>
                <div className="eyebrow mb-1">Where</div>
                <div className="text-[15px] font-semibold">{o.mode}</div>
              </div>
              <div>
                <div className="eyebrow mb-1">Applications close</div>
                <div className="text-[15px] font-semibold">{deadlineIn(o.deadlineDays)}</div>
              </div>
              {o.duration ? (
                <div>
                  <div className="eyebrow mb-1">Duration</div>
                  <div className="text-[15px] font-semibold">{o.duration}</div>
                </div>
              ) : null}
            </div>
          </div>

          <section className="mt-6">
            <h2 className="display-tight mb-3 text-[20px]">The work</h2>
            <p className="max-w-[70ch] text-[14.5px] leading-[1.75] text-ink2">{o.description}</p>
          </section>

          {o.requirements?.length ? (
            <section className="mt-6">
              <h2 className="display-tight mb-3 text-[20px]">What they need from you</h2>
              <ul className="space-y-2">
                {o.requirements.map((r) => (
                  <li key={r} className="flex gap-3 text-[14px] text-ink2">
                    <span className="mt-0.5 flex-none text-accentx">
                      <Icon name="check" size={15} />
                    </span>
                    {r}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-6">
            <h2 className="display-tight mb-3 text-[20px]">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {o.skills.map((s) => (
                <Tag key={s} tone={s.toLowerCase() === "react" ? "accent" : "default"}>
                  {s}
                </Tag>
              ))}
            </div>
          </section>

          <section className="tagshape mt-7 border border-rule bg-raised p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-onaccent">
                <Icon name="ai" size={14} filled />
              </span>
              <span className="text-[13px] font-bold">Why this matched you</span>
            </div>
            <ul className="space-y-2">
              {o.matchReasons.map((r) => (
                <li key={r} className="flex gap-3 text-[13.5px] text-ink2">
                  <span className="mt-0.5 flex-none text-accentx">
                    <Icon name="check" size={14} />
                  </span>
                  {r}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11.5px] text-ink3">
              Match scores are computed from your saved skills, location and pay range.
            </p>
          </section>
        </article>

        {/* ----------------------------------------------------- side */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <div className="tagshape border border-rule bg-raised p-5">
            {existing ? (
              <div>
                <div className="flex items-center gap-2 text-positive">
                  <Icon name="check" size={17} />
                  <span className="text-[14px] font-bold">
                    {`Application ${existing.stage.toLowerCase()}`}
                  </span>
                </div>
                {existing?.note && (
                  <p className="mt-2 rounded-[10px] border border-rule bg-ground p-3 text-[13px] text-ink2">
                    <span className="font-semibold">Your note:</span> {existing.note}
                  </p>
                )}
                <p className="mt-2 text-[13px] text-ink2">
                  {o.org} will reply through Earnly. You can follow the stage under My work.
                </p>
                <Button href="/app/work" variant="outline" full className="mt-4">
                  Track in My work
                </Button>
              </div>
            ) : (
              <>
                <Button full onClick={() => setOpenApply(true)} iconRight="arrowRight">
                  Apply for this
                </Button>
                <p className="mt-2.5 text-center text-[11.5px] text-ink3">
                  You will attach your Earnly profile. No CV needed.
                </p>
              </>
            )}
            <Link
              href="/app/ai"
              className="mt-3 flex items-center justify-center gap-2 text-[12.5px] font-semibold text-ink2 hover:text-ink"
            >
              <Icon name="ai" size={14} />
              Find more like this
            </Link>
          </div>

          <div className="tagshape border border-rule bg-raised p-5">
            <div className="eyebrow mb-2">Posted by</div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-ink/8 text-ink2">
                <Icon name={o.orgKind === "University" ? "cap" : "briefcase"} size={18} />
              </span>
              <div>
                <div className="text-[14px] font-bold">{o.org}</div>
                <div className="text-[12px] text-ink3">{o.orgKind}</div>
              </div>
            </div>
            <div className="mt-3">
              <VerifiedBadge label="Payment verified" />
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-ink3">
              Funds are held in escrow-style before work starts, so both sides know the money is
              there. In this prototype the escrow is a demo record, not an on-chain transaction.
            </p>
          </div>

          <div className="tagshape border border-rule bg-raised p-5">
            <div className="eyebrow mb-3">More in {o.category}</div>
            <div className="divide-y divide-[color:var(--rule)]">
              {alsoLike.map((x) => (
                <Link
                  key={x.id}
                  href={
                    x.kind === "task"
                      ? `/app/tasks/${x.id}`
                      : x.kind === "job"
                        ? `/app/jobs/${x.id}`
                        : `/app/internships/${x.id}`
                  }
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-semibold">{x.title}</span>
                    <span className="block text-[11.5px] text-ink3">{x.org}</span>
                  </span>
                  <Money amount={x.pay.amount} currency="" className="flex-none text-[12.5px]" />
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {alsoLike.length ? (
        <section className="mt-12">
          <SectionHeading eyebrow="Keep looking" title="Similar opportunities" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {alsoLike.map((x) => (
              <OpportunityCard key={x.id} o={x} compact />
            ))}
          </div>
        </section>
      ) : null}

      <Modal open={openApply} onClose={() => setOpenApply(false)} label="Apply">
        <div className="mb-4 flex items-center justify-between">
          <span className="display-tight text-[20px]">Apply</span>
          <button onClick={() => setOpenApply(false)} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="tagshape border border-rule bg-ground p-4">
          <div className="text-[15px] font-bold">{o.title}</div>
          <div className="mt-1 text-[12.5px] text-ink3">
            {o.org} · {o.mode} · {deadlineIn(o.deadlineDays)}
          </div>
        </div>
        <label className="mt-4 block">
          <span className="mb-2 block text-[13px] font-semibold">
            A short note (optional)
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={NOTE_MAX}
            rows={4}
            placeholder="Two lines about why you can do this, and when you are free."
            className="w-full resize-none rounded-[14px] border border-rule bg-transparent p-3 text-[14px] outline-none placeholder:text-ink3"
          />
        </label>
        <div className="mt-3 flex items-center gap-2 text-[12px] text-ink3">
          <Icon name="shield" size={14} />
          Your verified profile, rating and completed work are attached automatically.
        </div>
        <Button
          full
          className="mt-5"
          onClick={() => {
            apply(o.id, note.trim() || undefined);
            setOpenApply(false);
          }}
        >
          Send application
        </Button>
      </Modal>
    </div>
  );
}
