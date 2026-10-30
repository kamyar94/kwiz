// A question about one step of an animated solution (lib/math/solution/ask.ts). Open to the
// learners who may watch the solution; the answer comes from the account's AI provider for
// grading and is not stored.
import { runAiTask } from "@/lib/ai/service";
import { jsonError, jsonOk, mathRoute, readJson } from "@/lib/math/route-helpers";
import { MathError, getMathChallenge } from "@/lib/math/service";
import {
  cleanHistory,
  MAX_QUESTION_CHARS,
  STEP_TUTOR_SYSTEM,
  stepContext,
} from "@/lib/math/solution/ask";
import { canViewSolution, getSolution } from "@/lib/math/solutions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ challengeId: string }> };

const MAX_BODY = 16 * 1024;

export const POST = async (request: Request, { params }: Params) => {
  const challengeId = Number((await params).challengeId);
  return mathRoute(request, "solutions-ask", async (user) => {
    if (!Number.isInteger(challengeId) || challengeId <= 0) return jsonError(400, "Unknown problem.");
    if (!(await canViewSolution(user.id, user.isAdmin, challengeId)))
      return jsonError(403, "Check your answer first, then you can ask about the solution.");

    const body = (await readJson(request, MAX_BODY)) as Record<string, unknown> | null;
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    if (!question) throw new MathError(400, "Ask a question first.");
    if (question.length > MAX_QUESTION_CHARS)
      throw new MathError(400, `Keep the question under ${MAX_QUESTION_CHARS} characters.`);
    const step = Number(body?.step);
    const version = body?.version == null ? undefined : Number(body.version);

    const [challenge, solution] = await Promise.all([
      getMathChallenge(challengeId),
      getSolution(challengeId, Number.isInteger(version) ? version : undefined),
    ]);
    if (!solution) return jsonError(404, "This problem has no animated solution yet.");

    const context = stepContext(solution.script, challenge.statement, Number.isInteger(step) ? step : 0);
    const history = cleanHistory(body?.history);
    const response = await runAiTask(
      user.id,
      "grading",
      {
        system: `${STEP_TUTOR_SYSTEM}\n\n${context}`,
        history,
        prompt: question,
        maxOutputTokens: 1200,
      },
      { usageTask: "solution-question" }
    );
    return jsonOk({ answer: response.text.trim(), provider: response.provider, model: response.model });
  });
};
