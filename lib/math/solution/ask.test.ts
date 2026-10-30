// The context of a question about a step: the problem and the steps up to the one asked
// about, with their formulas and notes; and the conversation kept to its last few turns.
import { describe, expect, it } from "vitest";

import { cleanHistory, MAX_HISTORY_TURNS, stepContext } from "./ask";
import type { SolutionScript } from "./types";

const script: SolutionScript = {
  format: 1,
  question: [{ text: "A cyclist rides " }, { id: "q-d", text: "$120\\,\\mathrm{m}$" }, { text: " at 12 m/s." }],
  givens: [{ id: "d", symbol: "d", value: 120, unit: "m", span: "q-d", label: "distance" }],
  equations: [
    {
      id: "motion",
      states: [
        { id: "rule", latex: "\\term{t}{t} = \\frac{\\term{d}{d}}{\\term{v}{v}}" },
        { id: "result", latex: "\\term{t}{t} = \\term{res}{10}" },
      ],
    },
  ],
  graphs: [],
  figures: [],
  tables: [],
  notes: [{ id: "n1", text: "Time is distance over speed." }],
  steps: [
    { kind: "Extract", given: "d", duration: 2, narration: "The distance is 120 metres." },
    { kind: "Relate", equation: "motion", state: "rule", duration: 3, narration: "Time is distance over speed." },
    { kind: "Annotate", notes: ["n1"], duration: 3 },
    { kind: "Transform", equation: "motion", to: "result", duration: 3, narration: "120 over 12 is 10." },
    { kind: "Answer", equation: "motion", term: "res", text: "The ride takes 10 s.", duration: 2 },
  ],
};

describe("questions about a step", () => {
  it("lists the steps up to the one asked about, with formulas and notes", () => {
    const context = stepContext(script, "How long does the ride take?", 2);
    expect(context).toContain("Problem: How long does the ride take?");
    expect(context).toContain("1. Extract The distance is 120 metres.");
    expect(context).toContain("(distance: $d = 120$)");
    expect(context).toContain("[$t = \\frac{d}{v}$]");
    expect(context).toContain("Note: Time is distance over speed.");
    expect(context).not.toContain("120 over 12");
    expect(context).toContain("The student is at step 3 of 5.");
  });

  it("keeps a step number inside the solution", () => {
    expect(stepContext(script, "Q", 99)).toContain("Answer: The ride takes 10 s.");
    expect(stepContext(script, "Q", -3)).toContain("The student is at step 1 of 5.");
  });

  it("keeps only well-formed recent turns", () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `t${i}` }));
    const kept = cleanHistory([...turns, { role: "system", text: "x" }, { role: "user" }, "nonsense"]);
    expect(kept).toHaveLength(MAX_HISTORY_TURNS);
    expect(kept.at(-1)).toEqual({ role: "assistant", text: "t9" });
    expect(cleanHistory("not a list")).toEqual([]);
  });
});
