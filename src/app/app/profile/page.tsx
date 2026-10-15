"use client";

import { useState } from "react";
import { ReviewCard } from "@/components/cards";
import { SkillsPicker } from "@/components/SkillsPicker";
import {
  Button,
  Icon,
  Modal,
  Money,
  Progress,
  SectionHeading,
  Stars,
  Tag,
  VerifiedBadge,
} from "@/components/ui";
import { DEMO_REVIEWS, findOpportunity } from "@/lib/data";
import { deriveReliabilityMetrics } from "@/lib/reputation";
import { useApp } from "@/lib/store";

export default function ProfilePage() {
  const { student, applications, txns, save, user } = useApp();
  const completed = applications.filter((a) => ["Completed", "Paid"].includes(a.stage));
  const reliability = deriveReliabilityMetrics(applications, txns);
  const [editingSkills, setEditingSkills] = useState(false);
  const [draftSkills, setDraftSkills] = useState<string[]>(student.skills);

  return (
    <div className="mx-auto max-w-[1180px]">
      <section className="tagshape relative overflow-hidden border border-rule bg-raised p-6 sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-accent/12 blur-3xl"
        />
        <div className="relative flex flex-wrap items-start gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={student.avatar}
            alt=""
            className="hard-sm h-20 w-20 flex-none rounded-[22px] object-cover sm:h-24 sm:w-24"
          />
          <div className="min-w-[240px] flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="display text-[30px] sm:text-[38px]">{student.name}</h1>
              <VerifiedBadge />
            </div>
            <p className="mt-2 text-[14px] text-ink2">
              {student.course} · {student.university} · Class of {student.gradYear}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink2">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="pin" size={14} />
                {student.location}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="mail" size={14} />
                {student.studentEmail}
              </span>
            </div>
            <p className="mt-4 max-w-[64ch] text-[14px] leading-relaxed text-ink2">{student.bio}</p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Button iconRight="arrowUpRight">Share profile</Button>
              <Button variant="outline">Edit details</Button>
            </div>
          </div>

          <div className="grid w-full grid-cols-2 gap-3 sm:w-auto">
            {[
              { k: "Rating", v: `${student.rating.toFixed(1)} ★`, sub: `${student.reviewCount} reviews` },
              { k: "Completed", v: String(student.completedCount), sub: "opportunities" },
              { k: "On time", v: `${student.completionRate}%`, sub: "completion rate" },
              { k: "Earned", v: String(student.earnedTotal), sub: "USDC, all time" },
            ].map((s) => (
              <div key={s.k} className="tagshape border border-rule bg-ground/60 px-4 py-3">
                <div className="eyebrow mb-1">{s.k}</div>
                <div className="figure text-[20px] font-bold">{s.v}</div>
                <div className="mt-0.5 text-[11px] text-ink3">{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1.5fr_1fr] lg:items-start">
        <div>
          <SectionHeading eyebrow="Capabilities" title="Skills" />
          <div className="flex flex-wrap gap-2">
            {student.skills.map((s) => (
              <Tag key={s} tone="accent">
                {s}
              </Tag>
            ))}
            <button
              onClick={() => {
                setDraftSkills(student.skills);
                setEditingSkills(true);
              }}
              className="rounded-full border border-dashed border-rule px-2.5 py-1 text-[11.5px] text-ink3 hover:text-ink"
            >
              + Add skill
            </button>
          </div>

          <section className="mt-9">
            <SectionHeading
              eyebrow="Proof of work"
              title="Completed on Earnly"
              action={<span className="figure text-[12.5px] text-ink3">{completed.length} shown</span>}
            />
            <div className="tagshape divide-y divide-[color:var(--rule)] border border-rule bg-raised px-5">
              {completed.map((a) => {
                const o = findOpportunity(a.opportunityId);
                if (!o) return null;
                return (
                  <div key={a.id} className="flex items-start justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <div className="text-[15px] font-bold">{o.title}</div>
                      <div className="mt-0.5 text-[12.5px] text-ink3">
                        {o.org} · {o.category}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {o.skills.slice(0, 3).map((s) => (
                          <Tag key={s}>{s}</Tag>
                        ))}
                      </div>
                    </div>
                    <div className="flex-none text-right">
                      <Money amount={o.pay.amount} className="text-[15px]" />
                      <div className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-semibold text-positive">
                        <Icon name="check" size={13} />
                        {a.stage}
                      </div>
                    </div>
                  </div>
                );
              })}
              {completed.length === 0 ? (
                <p className="py-6 text-[13.5px] text-ink3">
                  Finish a piece of work and it will be listed here as evidence.
                </p>
              ) : null}
            </div>
          </section>

          <section className="mt-9">
            <SectionHeading eyebrow="Reputation" title="What posters say" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {DEMO_REVIEWS.map((r) => (
                <ReviewCard key={r.id} r={r} />
              ))}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-5 lg:sticky lg:top-24">
          <section className="tagshape border border-rule bg-raised p-5">
            <SectionHeading eyebrow="Reliability" title="Why this matters" />
            <div className="space-y-4">
              <Progress value={student.completionRate} label="Completed on time" />
              <Progress value={reliability.repliedWithinDayRate} label="Replied within a day" />
              <Progress value={reliability.repeatPostersRate} label="Repeat posters" />
            </div>
            <p className="mt-4 text-[12.5px] leading-relaxed text-ink3">
              Every rating comes from a poster after the work is paid, so it is proof of work rather
              than a popularity score.
            </p>
          </section>

          <section className="tagshape border border-rule bg-raised p-5">
            <SectionHeading eyebrow="History" title="Experience" />
            <ol className="relative ml-1 space-y-5 border-l border-rule pl-5">
              {[
                { t: "Freelance web work", s: "Bright Bakery, Ada Studio, Green Basket Co-op", d: "2025 — now" },
                { t: "Event photographer", s: "Faculty of Science, departmental dinners", d: "2025" },
                { t: "Course rep, Computer Science", s: "University of Lagos", d: "2024 — 2025" },
                { t: "BSc Computer Science", s: "University of Lagos", d: "2023 — 2027" },
              ].map((e) => (
                <li key={e.t} className="relative">
                  <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent" />
                  <div className="text-[14px] font-bold">{e.t}</div>
                  <div className="text-[12.5px] text-ink2">{e.s}</div>
                  <div className="mt-0.5 text-[11.5px] text-ink3">{e.d}</div>
                </li>
              ))}
            </ol>
          </section>

          <section className="tagshape border border-rule bg-raised p-5">
            <div className="eyebrow mb-2">Verified student</div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-accent/15 text-accentx">
                <Icon name="shield" size={19} />
              </span>
              <div>
                <div className="text-[13.5px] font-bold">{student.studentId}</div>
                <div className="text-[12px] text-ink3">Matched to a student record</div>
              </div>
            </div>
            <div className="mt-4 border-t border-rule pt-4">
              <div className="mb-2 flex items-center gap-2 text-[12.5px] text-ink3">
                <Stars value={student.rating} size={13} />
                <span className="figure">{student.rating.toFixed(1)} average</span>
              </div>
              <p className="text-[12px] leading-relaxed text-ink3">
                Posters see your verified badge, not your ID document. Sensitive documents are
                discarded after the check.
              </p>
            </div>
          </section>
        </aside>
      </div>
      <Modal
        open={editingSkills}
        onClose={() => setEditingSkills(false)}
        label="Edit your skills"
        wide
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="display-tight text-[20px]">Your skills</span>
          <button onClick={() => setEditingSkills(false)} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>
        <p className="mb-4 text-[13px] text-ink2">
          These drive what the AI finder searches for and what posters see first.
        </p>
        <SkillsPicker value={draftSkills} onChange={setDraftSkills} suggestions={student.skills} />
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
          <Button
            onClick={() => {
              void save({ skills: draftSkills });
              setEditingSkills(false);
            }}
            iconRight="check"
          >
            Save skills
          </Button>
          <span className="text-[12px] text-ink3">
            {user ? "Saved to your Earnly account." : "Demo mode — kept in this browser only."}
          </span>
        </div>
      </Modal>

    </div>
  );
}
