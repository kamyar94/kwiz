"use client";

// The scrolling view of the solution player: every step that has started so far, as a list
// that grows while the solution plays and scrolls itself to the newest step. Scrolling up to
// review an earlier step stops the following until the list is back at the bottom; tapping a
// step plays the solution from there.
import { useEffect, useRef } from "react";

import { lineShownAt, type Timeline } from "@/lib/math/solution/timeline";
import { cn } from "@/lib/utils";

import { MathFormula, MathText } from "../math-text";

type StepLogProps = {
  timeline: Timeline;
  /** The step playing now; the list shows it and every step before it. */
  step: number;
  onSeek: (index: number) => void;
  className?: string;
};

const StepVisual = ({ timeline, index }: { timeline: Timeline; index: number }) => {
  const { script } = timeline;
  const step = timeline.steps[index].step;
  if (step.kind === "Extract") {
    const given = script.givens.find((g) => g.id === step.given);
    if (!given) return null;
    const unit = given.unit ? `\\,\\mathrm{${given.unit}}` : "";
    return (
      <p className="flex flex-wrap items-baseline gap-x-2">
        <MathFormula latex={`${given.symbol} = ${String(given.value)}${unit}`} />
        {given.label && <span className="text-xs text-neutral-500">{given.label}</span>}
      </p>
    );
  }
  if (step.kind === "Annotate")
    return (
      <div className="space-y-1">
        {step.notes.map((id) => {
          const note = script.notes.find((n) => n.id === id);
          return note ? (
            <MathText key={id} text={note.text} className="rounded-lg bg-amber-50 px-2 py-1 text-sm" />
          ) : null;
        })}
      </div>
    );
  if (step.kind === "Answer")
    return step.text ? (
      <MathText text={step.text} className="rounded-lg bg-green-50 px-2 py-1 font-bold text-green-800" />
    ) : null;
  if (step.kind === "Construct" && step.table && step.rows) {
    const table = script.tables.find((t) => t.id === step.table);
    return table ? (
      <div className="space-y-0.5 text-sm">
        {step.rows.map((row) => (
          <MathText key={row} text={(table.rows[row] ?? []).join(" · ")} />
        ))}
      </div>
    ) : null;
  }
  const latex = lineShownAt(timeline, index);
  return latex ? <MathFormula latex={latex} display className="text-base" /> : null;
};

export const StepLog = ({ timeline, step, onSeek, className }: StepLogProps) => {
  const listRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const shown = Math.min(Math.max(step, 0), timeline.steps.length - 1);

  useEffect(() => {
    const list = listRef.current;
    if (list && follow.current) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [shown]);

  return (
    <div
      ref={listRef}
      onScroll={() => {
        const list = listRef.current;
        if (list) follow.current = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
      }}
      className={cn(
        "max-h-[55dvh] min-h-[12rem] space-y-2 overflow-y-auto rounded-xl border-2 border-slate-200 bg-white p-2",
        className
      )}
      aria-label="The steps so far"
    >
      {timeline.steps.slice(0, shown + 1).map((timed) => (
        <div
          key={timed.index}
          role="button"
          tabIndex={0}
          onClick={() => onSeek(timed.index)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.stopPropagation();
            onSeek(timed.index);
          }}
          className={cn(
            "cursor-pointer",
            "block w-full rounded-lg border-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-slate-50",
            timed.index === shown ? "border-sky-300 bg-sky-50/60" : "border-transparent"
          )}
        >
          <span className="mb-1 flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-600">
              {timed.index + 1}
            </span>
            <span>{timed.step.narration ?? timed.step.kind}</span>
          </span>
          <div className="pl-7">
            <StepVisual timeline={timeline} index={timed.index} />
          </div>
        </div>
      ))}
    </div>
  );
};
