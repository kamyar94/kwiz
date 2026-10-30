"use client";

// "Ask about this step" in the solution player. Holding the microphone pauses the solution and
// listens with the browser's own speech recognition (Chrome, Edge and Safari have it); letting
// go sends the words, with the problem and the steps so far, to the account's AI provider. A
// short tap opens a text field instead, which also serves browsers without speech recognition.
// The answer is shown under the subtitles and read aloud when the device can speak.
import { useEffect, useRef, useState, type PointerEvent } from "react";

import Link from "next/link";
import { LoaderCircle, Mic, Send, X } from "lucide-react";

import { readAloud } from "@/components/voice/read-aloud";
import { voiceNow } from "@/components/voice/voice-store";
import type { StepTurn } from "@/lib/math/solution/ask";
import { cn } from "@/lib/utils";

import { MathText } from "../math-text";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionConstructor = new () => Recognition;

const recognitionConstructor = (): RecognitionConstructor | null => {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
};

/** A press shorter than this is a tap: it opens the text field instead of listening. */
const TAP_MS = 350;

const AI_SETUP = new Set(["no-key", "auth", "config"]);

type AskStepProps = {
  challengeId: number;
  version: number;
  step: number;
  /** Pauses the solution while the learner asks. */
  onAsk: () => void;
};

export const AskStep = ({ challengeId, version, step, onAsk }: AskStepProps) => {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; setup: boolean } | null>(null);
  const [turns, setTurns] = useState<StepTurn[]>([]);
  const [canListen, setCanListen] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const heard = useRef("");
  const pressedAt = useRef(0);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Known only in the browser, after the first render.
    const supported = recognitionConstructor() !== null;
    const id = requestAnimationFrame(() => setCanListen(supported));
    return () => {
      cancelAnimationFrame(id);
      recognition.current?.abort();
    };
  }, []);

  const send = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch(`/api/math/solutions/${challengeId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ question: text, step, version, history: turns }),
      });
      const data = (await response.json().catch(() => null)) as
        | { answer?: string; error?: string; aiError?: string }
        | null;
      if (!response.ok || !data?.answer) {
        setProblem({
          message: data?.error ?? "The question could not be answered. Please try again.",
          setup: !!data?.aiError && AI_SETUP.has(data.aiError),
        });
        return;
      }
      const answer = data.answer;
      setTurns((current) => [...current, { role: "user", text }, { role: "assistant", text: answer }]);
      setDraft("");
      if (voiceNow().canSpeak) void readAloud(`solution-ask-${challengeId}`, answer).catch(() => undefined);
    } catch {
      setProblem({ message: "The question could not be sent. Check the connection.", setup: false });
    } finally {
      setBusy(false);
    }
  };

  const startListening = () => {
    const Constructor = recognitionConstructor();
    if (!Constructor) return;
    const active = new Constructor();
    active.lang = navigator.language || "en-US";
    active.continuous = true;
    active.interimResults = true;
    heard.current = "";
    active.onresult = (event) => {
      const words = Array.from(event.results, (result) => result[0]?.transcript ?? "").join(" ");
      heard.current = words.replace(/\s+/g, " ").trim();
      setDraft(heard.current);
    };
    active.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed")
        setProblem({ message: "The microphone is blocked for this site. Allow it, or type the question.", setup: false });
    };
    active.onend = () => {
      setListening(false);
      recognition.current = null;
      if (heard.current) void send(heard.current);
    };
    recognition.current = active;
    try {
      active.start();
      setListening(true);
    } catch {
      recognition.current = null;
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Holding still works without capture.
    }
    pressedAt.current = performance.now();
    onAsk();
    setOpen(true);
    setProblem(null);
    if (canListen && !busy) startListening();
  };

  const onPointerUp = () => {
    const tap = performance.now() - pressedAt.current < TAP_MS;
    if (recognition.current) {
      if (tap) {
        heard.current = "";
        recognition.current.abort();
      } else recognition.current.stop();
    }
    if (tap || !canListen) requestAnimationFrame(() => field.current?.focus());
  };

  return (
    <>
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(event) => event.preventDefault()}
        aria-label={canListen ? "Hold to ask about this step" : "Ask about this step"}
        title={canListen ? "Hold to ask about this step" : "Ask about this step"}
        className={cn(
          // Over the left end of the subtitle bar, which the player puts just above this.
          "absolute left-1.5 top-[1.375rem] flex h-8 w-8 -translate-y-1/2 touch-none select-none items-center justify-center rounded-full text-white/80 hover:bg-white/15",
          listening && "bg-rose-500 text-white hover:bg-rose-500"
        )}
      >
        <Mic className={cn("h-4 w-4", listening && "animate-pulse")} />
      </button>

      {open && (
        <div className="space-y-2 rounded-xl border-2 border-slate-200 bg-white p-3 text-left text-sm text-neutral-700">
          <div className="flex items-center justify-between gap-2">
            <p className="font-bold text-neutral-600">Ask about step {step + 1}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close the question panel"
              className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {turns.length > 0 && (
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {turns.map((turn, index) =>
                turn.role === "user" ? (
                  <p key={index} className="ml-8 rounded-lg bg-sky-50 px-2 py-1 text-right">
                    {turn.text}
                  </p>
                ) : (
                  <MathText key={index} text={turn.text} className="mr-4 rounded-lg bg-slate-50 px-2 py-1" />
                )
              )}
            </div>
          )}

          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <textarea
              ref={field}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
              maxLength={600}
              placeholder={listening ? "Listening..." : canListen ? "Hold the microphone and speak, or type here" : "Type your question"}
              className="min-h-[2.75rem] flex-1 resize-none rounded-lg border-2 border-slate-200 px-2 py-1 focus:border-sky-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Send the question"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white disabled:opacity-50"
            >
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>

          {problem && (
            <p className="rounded-lg bg-amber-50 px-2 py-1 text-amber-800">
              {problem.message}{" "}
              {problem.setup && (
                <Link href="/settings/ai" className="font-bold text-sky-600 hover:underline">
                  Open the AI settings
                </Link>
              )}
            </p>
          )}
        </div>
      )}
    </>
  );
};
