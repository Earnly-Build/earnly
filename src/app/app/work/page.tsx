"use client";

import Link from "next/link";
import { useState } from "react";
import { findOpportunity } from "@/lib/data";
import { useApp } from "@/lib/store";
import { APP_STAGES, type AppStage } from "@/lib/types";
import {
  Button,
  EmptyState,
  Icon,
  Money,
  SectionHeading,
  StageBadge,
} from "@/components/ui";

const NEXT_ACTION: Record<AppStage, string> = {
  Applied: "Waiting on the poster to reply. Most reply within two days.",
  Accepted: "Agree a start time, then mark it in progress.",
  "In progress": "Do the work. Keep the messages in Earnly so there is a record.",
  Submitted: "Waiting on the poster to check the work.",
  Completed: "Payment is released to your balance.",
  Paid: "Done. This one now counts on your profile.",
};

export default function WorkPage() {
  const { applications, advance } = useApp();
  const [filter, setFilter] = useState<"all" | "open" | "done">("all");

  const rows = applications
    .map((a) => ({ a, o: findOpportunity(a.opportunityId) }))
    .filter((r) => r.o)
    .filter((r) => {
      if (filter === "open") return !["Completed", "Paid"].includes(r.a.stage);
      if (filter === "done") return ["Completed", "Paid"].includes(r.a.stage);
      return true;
    });

  const earned = applications
    .filter((a) => a.stage === "Paid")
    .reduce((s, a) => s + (findOpportunity(a.opportunityId)?.pay.amount ?? 0), 0);

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-6">
        <span className="eyebrow">My work</span>
        <h1 className="display mt-2 text-[36px] sm:text-[46px]">Every step, one place</h1>
        <p className="mt-3 max-w-[62ch] text-[14.5px] leading-relaxed text-ink2">
          From applying to being paid. Nothing goes quiet: each stage tells you what happens next,
          and the money stays visible the whole way.
        </p>
      </header>

      {/* the pipeline: the product's one big custom graphic */}
      <section className="tagshape mb-6 border border-rule bg-raised p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="eyebrow">The path</span>
          <span className="figure text-[12.5px] text-ink3">
            {applications.filter((a) => a.stage === "Paid").length} paid ·{" "}
            {applications.filter((a) => !["Completed", "Paid"].includes(a.stage)).length} open
          </span>
        </div>
        <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
          {APP_STAGES.map((s, i) => {
            const count = applications.filter((a) => a.stage === s).length;
            return (
              <div key={s} className="flex min-w-0 flex-1 items-center gap-1.5">
                <div
                  className={`tagshape min-w-[96px] flex-1 border p-3 ${
                    count > 0 ? "border-accent/50 bg-accent/[.08]" : "border-rule"
                  }`}
                >
                  <div className="text-[11.5px] font-semibold text-ink3">{s}</div>
                  <div className="figure mt-1.5 text-[22px] font-bold">{count}</div>
                </div>
                {i < APP_STAGES.length - 1 ? (
                  <span className="flex-none text-ink3/60">
                    <Icon name="chevron" size={14} />
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-rule pt-4 text-[13px] text-ink2">
          <span>
            Paid so far this year <Money amount={earned} className="text-[15px] text-ink" />
          </span>
          <span className="inline-flex items-center gap-1.5 text-ink3">
            <Icon name="lock" size={14} />
            Funds are held before work starts
          </span>
        </div>
      </section>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {(["all", "open", "done"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold capitalize transition-colors ${
              filter === f ? "border-accent bg-accent text-onaccent" : "border-rule text-ink2"
            }`}
          >
            {f === "all" ? "Everything" : f}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body="When you apply for a task, job or internship it appears here and stays visible until it is paid."
          action={
            <Button href="/app/tasks" variant="outline">
              Browse tasks
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {rows.map(({ a, o }) => {
            if (!o) return null;
            const step = APP_STAGES.indexOf(a.stage);
            return (
              <article key={a.id} className="tagshape border border-rule bg-raised p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={
                        o.kind === "task"
                          ? `/app/tasks/${o.id}`
                          : o.kind === "job"
                            ? `/app/jobs/${o.id}`
                            : `/app/internships/${o.id}`
                      }
                      className="text-[16px] font-bold hover:underline"
                    >
                      {o.title}
                    </Link>
                    <div className="mt-0.5 text-[12.5px] text-ink3">
                      {o.org} · {o.mode}
                    </div>
                  </div>
                  <StageBadge stage={a.stage} />
                </div>

                <div className="mt-4 flex items-center gap-1.5">
                  {APP_STAGES.map((s, i) => (
                    <span
                      key={s}
                      title={s}
                      className={`h-1.5 flex-1 rounded-full ${
                        i < step ? "bg-accent/50" : i === step ? "bg-accent" : "bg-ink/12"
                      }`}
                    />
                  ))}
                </div>

                <p className="mt-3 text-[13px] text-ink2">{NEXT_ACTION[a.stage]}</p>

                {a.note && (
                  <p className="mt-2 rounded-[10px] border border-rule bg-ground p-3 text-[12.5px] text-ink3">
                    <span className="font-semibold text-ink2">Note sent:</span> {a.note}
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-rule pt-4">
                  <Money amount={o.pay.amount} className="text-[15px]" />
                  {a.stage !== "Paid" ? (
                    <Button size="sm" variant="outline" onClick={() => advance(a.id)}>
                      Move to next stage
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-positive">
                      <Icon name="check" size={14} />
                      Counts on your profile
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <section className="mt-10">
        <SectionHeading eyebrow="Prototype note" title="What is real here" />
        <div className="tagshape border border-dashed border-rule p-5 text-[13.5px] leading-relaxed text-ink2">
          The stages, the applications and the amounts are demo data, and moving a stage is a
          button in this prototype. The states exist so the flow can be wired to a real
          applications service and an escrow contract without redesigning the screen.
        </div>
      </section>
    </div>
  );
}
