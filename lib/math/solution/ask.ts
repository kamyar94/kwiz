// Questions about one step of an animated solution: the learner holds the microphone (or
// types) while the player is at a step, and the AI provider chosen for grading answers with
// the problem and the steps so far in view. No answer is stored; the browser keeps the short
// conversation while the player is open.
import { compileTimeline, lineShownAt } from "./timeline";
import type { SolutionScript } from "./types";

export const MAX_QUESTION_CHARS = 600;
export const MAX_HISTORY_TURNS = 6;

export type StepTurn = { role: "user" | "assistant"; text: string };

export const STEP_TUTOR_SYSTEM = [
  "You are a patient tutor. The student is watching an animated worked solution of one problem",
  "and has paused at a step to ask about it. Answer the question about that step in at most five",
  "short sentences: first what the step is trying to achieve and why it is done that way, then",
  "the arithmetic if they ask about it. Use the numbers of this problem only. Write math between",
  "dollar signs, for example $W - K + 2P$. If the question is unclear, answer its most likely",
  "meaning in one sentence and invite a more specific question.",
].join(" ");

const textOf = (value: string) => value.replace(/\s+/g, " ").trim();

/** The problem and the solution up to and including `step`, as plain text for the prompt. */
export const stepContext = (script: SolutionScript, statement: string, step: number) => {
  const timeline = compileTimeline(script);
  const last = Math.min(Math.max(step, 0), timeline.steps.length - 1);
  const lines: string[] = [`Problem: ${textOf(statement)}`, "", "Solution so far:"];
  for (let index = 0; index <= last; index += 1) {
    const timed = timeline.steps[index];
    const parts = [`${index + 1}. ${timed.step.kind}`];
    if (timed.step.narration) parts.push(textOf(timed.step.narration));
    const latex = lineShownAt(timeline, index);
    if (latex) parts.push(`[$${latex}$]`);
    if (timed.step.kind === "Extract") {
      const given = script.givens.find((g) => g.id === (timed.step as { given: string }).given);
      if (given) parts.push(`(${given.label ?? given.symbol}: $${given.symbol} = ${String(given.value)}$)`);
    }
    if (timed.step.kind === "Annotate")
      for (const id of timed.step.notes) {
        const note = script.notes.find((n) => n.id === id);
        if (note) parts.push(`Note: ${textOf(note.text)}`);
      }
    if (timed.step.kind === "Answer" && timed.step.text) parts.push(`Answer: ${textOf(timed.step.text)}`);
    lines.push(parts.join(" "));
  }
  lines.push("", `The student is at step ${last + 1} of ${timeline.steps.length}.`);
  return lines.join("\n");
};

/** Keeps the last few well-formed turns of the conversation. */
export const cleanHistory = (value: unknown): StepTurn[] =>
  (Array.isArray(value) ? value : [])
    .filter(
      (turn): turn is StepTurn =>
        !!turn &&
        typeof turn === "object" &&
        ((turn as StepTurn).role === "user" || (turn as StepTurn).role === "assistant") &&
        typeof (turn as StepTurn).text === "string"
    )
    .map((turn) => ({ role: turn.role, text: turn.text.slice(0, 2000) }))
    .slice(-MAX_HISTORY_TURNS);
