"use client";

// The animated solution player (docs/DESIGN-coding-and-math.md, section 5.5): the stage, a
// timeline with a draggable handle and step markers, play and pause, step buttons, speed,
// subtitles for the narration and keyboard shortcuts (space, arrow keys, Home, End). Every
// frame is computed from the script and the time; nothing runs on its own.
import "katex/dist/katex.min.css";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { Film, ListOrdered, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";

import { useNarration, type NarrationSource } from "@/components/voice/narration";
import { VoiceNote } from "@/components/voice/voice-note";
import { compileTimeline, frameAt, lineShownAt } from "@/lib/math/solution/timeline";
import type { SolutionScript } from "@/lib/math/solution/types";
import { cn } from "@/lib/utils";

import { MathFormula } from "../math-text";

import { AskStep } from "./ask-step";
import { Stage } from "./stage";
import { StepLog } from "./step-log";
import { SPEEDS, usePlayback } from "./use-playback";

type ViewMode = "steps" | "scroll";
const VIEW_KEY = "lingo.solution.view";

const readView = (): ViewMode => {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "scroll" ? "scroll" : "steps";
  } catch {
    return "steps";
  }
};

export type PlayerStart = {
  /** The step to open at. */
  step: number;
  /** The learner's line that went wrong, shown beside the correct one. */
  learnerLine?: string | null;
  lineNumber?: number;
};

type SolutionPlayerProps = {
  script: SolutionScript;
  start?: PlayerStart | null;
  className?: string;
  /**
   * Where the narration audio comes from. Left out, the narration shows as subtitles only.
   * Audio plays when the account has voice turned on and the voice server (or, if the device
   * allows it, the browser's own voice) can read it.
   */
  narration?: NarrationSource | null;
};

const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const SolutionPlayer = ({ script, start, className, narration }: SolutionPlayerProps) => {
  const timeline = useMemo(() => compileTimeline(script), [script]);
  const starts = useMemo(() => timeline.steps.map((step) => step.start), [timeline]);
  const startStep = Math.min(Math.max(start?.step ?? 0, 0), Math.max(0, timeline.steps.length - 1));
  const playback = usePlayback(timeline.total, starts, starts[startStep] ?? 0);
  const { time, playing, speed } = playback;
  const frame = useMemo(() => frameAt(timeline, time), [timeline, time]);
  const voice = useNarration({
    source: narration,
    timeline,
    step: frame.step,
    time,
    playing,
    speed,
    seekEpoch: playback.seekEpoch,
    holdRef: playback.holdRef,
  });
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ resume: boolean } | null>(null);

  // Two views: one step at a time on the stage, or a list that keeps every step so far and
  // scrolls along. The choice is kept in this browser.
  const [view, setView] = useState<ViewMode>("steps");
  useEffect(() => {
    const saved = readView();
    const id = requestAnimationFrame(() => setView(saved));
    return () => cancelAnimationFrame(id);
  }, []);
  const switchView = () => {
    const next = view === "steps" ? "scroll" : "steps";
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // The choice then lasts until the player closes.
    }
  };

  // Hold to pause: a finger (or the mouse button) held on the picture pauses the solution until
  // it lifts. A small red dot in the top corner away from the finger says so.
  const [held, setHeld] = useState<"left" | "right" | null>(null);
  const heldSince = useRef(0);
  // A long hold on a step of the list must not also count as a tap that jumps to that step.
  const longHold = useRef(false);
  const holdStart = (event: PointerEvent<HTMLDivElement>) => {
    longHold.current = false;
    if (!playing || (event.pointerType === "mouse" && event.button !== 0)) return;
    if ((event.target as HTMLElement).closest("button, a, input, textarea, select")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    heldSince.current = performance.now();
    setHeld(event.clientX - rect.left > rect.width / 2 ? "left" : "right");
    playback.pause();
  };
  const holdEnd = () => {
    if (!held) return;
    longHold.current = performance.now() - heldSince.current > 350;
    setHeld(null);
    playback.play();
  };
  const seekToStep = (index: number) => {
    if (longHold.current) {
      longHold.current = false;
      return;
    }
    playback.seek(timeline.steps[index]?.start ?? 0);
  };

  const ask = narration?.kind === "saved" ? narration : null;

  const correctLine = start?.learnerLine ? lineShownAt(timeline, startStep) : null;

  const seekToPointer = (event: PointerEvent) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const f = rect.width ? (event.clientX - rect.left) / rect.width : 0;
    playback.seek(f * timeline.total);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLSelectElement) return;
    const keys: Record<string, () => void> = {
      " ": () => {
        voice.unlock();
        playback.toggle();
      },
      ArrowRight: playback.nextStep,
      ArrowLeft: playback.previousStep,
      Home: () => playback.seek(0),
      End: () => playback.seek(timeline.total),
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  };

  return (
    <div
      className={cn("space-y-3 outline-none", className)}
      tabIndex={0}
      data-exercise-keys
      onKeyDown={onKeyDown}
      aria-label="Animated solution. Space plays or pauses, the arrow keys move between steps."
    >
      {start?.learnerLine && (
        <div className="grid gap-2 rounded-xl border-2 border-rose-100 bg-rose-50/60 px-3 py-2 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-rose-600">
              Your line{start.lineNumber ? ` ${start.lineNumber}` : ""}
            </div>
            <MathFormula latex={start.learnerLine} className="text-base" />
          </div>
          {correctLine && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-green-700">The solution at this step</div>
              <MathFormula latex={correctLine} className="text-base" />
            </div>
          )}
        </div>
      )}

      <div
        className="relative select-none"
        onPointerDown={holdStart}
        onPointerUp={holdEnd}
        onPointerCancel={holdEnd}
        onPointerLeave={holdEnd}
        onContextMenu={(event) => held && event.preventDefault()}
      >
        {view === "steps" ? (
          <Stage timeline={timeline} frame={frame} />
        ) : (
          <StepLog
            timeline={timeline}
            step={frame.step}
            onSeek={seekToStep}
          />
        )}
        {held && (
          <span
            role="status"
            aria-label="Paused while you hold"
            className={cn(
              "pointer-events-none absolute top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white shadow",
              held === "left" ? "left-2" : "right-2"
            )}
          >
            <Pause className="h-3.5 w-3.5" fill="currentColor" />
          </span>
        )}
      </div>

      <div className="relative space-y-2">
        <div className="relative min-h-[2.75rem] rounded-xl bg-neutral-800 px-4 py-2 text-center text-sm text-white lg:text-base">
          <p
            aria-live="polite"
            className={cn(
              ask && "pl-8",
              voice.available && voice.hasStepNarration && "pr-8",
              ask && !(voice.available && voice.hasStepNarration) && "pr-8"
            )}
          >
            {frame.narration ?? "\u00a0"}
          </p>
          {voice.available && voice.hasStepNarration && (
            <button
              type="button"
              onClick={voice.hearStep}
              aria-label="Hear this step"
              title="Hear this step"
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-white/80 hover:bg-white/15"
            >
              <Volume2 className={cn("h-4 w-4", voice.phase === "loading" && "animate-pulse")} />
            </button>
          )}
        </div>
        {ask && (
          <AskStep
            challengeId={ask.challengeId}
            version={ask.version}
            step={frame.step}
            onAsk={() => {
              voice.unlock();
              playback.pause();
            }}
          />
        )}
      </div>
      {voice.away && <VoiceNote className="justify-end" />}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={playback.previousStep}
          aria-label="Previous step"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-600 hover:bg-slate-100"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            voice.unlock();
            playback.toggle();
          }}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white hover:bg-sky-600"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={playback.nextStep}
          aria-label="Next step"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-600 hover:bg-slate-100"
        >
          <SkipForward className="h-4 w-4" />
        </button>

        <div
          ref={trackRef}
          role="slider"
          tabIndex={-1}
          aria-label="Position in the solution"
          aria-valuemin={0}
          aria-valuemax={Math.round(timeline.total)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${clock(time)} of ${clock(timeline.total)}, step ${frame.step + 1} of ${timeline.steps.length}`}
          className="relative h-8 flex-1 cursor-pointer touch-none select-none"
          onPointerDown={(event) => {
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Pointers that are no longer active cannot be captured; dragging still works inside.
            }
            dragging.current = { resume: playing };
            playback.pause();
            seekToPointer(event);
          }}
          onPointerMove={(event) => {
            if (dragging.current) seekToPointer(event);
          }}
          onPointerUp={() => {
            if (dragging.current?.resume) playback.play();
            dragging.current = null;
          }}
          onPointerCancel={() => {
            dragging.current = null;
          }}
        >
          <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200" />
          <div
            className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-sky-400"
            style={{ width: `${timeline.total ? (time / timeline.total) * 100 : 0}%` }}
          />
          {timeline.steps.map((timed) => (
            <div
              key={timed.index}
              title={`${timed.index + 1}. ${timed.step.kind}`}
              className={cn(
                "absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded",
                timed.start <= time ? "bg-sky-600" : "bg-slate-400"
              )}
              style={{ left: `${timeline.total ? (timed.start / timeline.total) * 100 : 0}%` }}
            />
          ))}
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-500 shadow"
            style={{ left: `${timeline.total ? (time / timeline.total) * 100 : 0}%` }}
          />
        </div>

        <span className="hidden w-[5.5rem] shrink-0 text-right text-xs tabular-nums text-neutral-500 sm:inline">
          {clock(time)} / {clock(timeline.total)}
        </span>
        {voice.available && (
          <button
            type="button"
            onClick={() => voice.setOn(!voice.on)}
            aria-pressed={voice.on}
            aria-label={voice.on ? "Turn the narration voice off" : "Turn the narration voice on"}
            title={voice.on ? "Narration voice on" : "Narration voice off"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-600 hover:bg-slate-100"
          >
            {voice.on ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={switchView}
          aria-pressed={view === "scroll"}
          aria-label={view === "steps" ? "Show the steps as a scrolling list" : "Show one step at a time"}
          title={view === "steps" ? "Scrolling list of steps" : "One step at a time"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-600 hover:bg-slate-100"
        >
          {view === "steps" ? <ListOrdered className="h-4 w-4" /> : <Film className="h-4 w-4" />}
        </button>
        <label className="shrink-0">
          <span className="sr-only">Speed</span>
          <select
            value={speed}
            onChange={(event) => playback.setSpeed(Number(event.target.value))}
            className="rounded-lg border-2 border-slate-200 bg-white px-1 py-1 text-xs"
          >
            {SPEEDS.map((value) => (
              <option key={value} value={value}>
                {value}x
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-right text-xs text-neutral-400">
        Step {frame.step + 1} of {timeline.steps.length}
      </p>
    </div>
  );
};

export default SolutionPlayer;
