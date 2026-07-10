/**
 * Method 3 — Error-aware, feedback-first grading with boundary examples.
 * Ported from the reference project's lib/methods/method3.ts, adapted to take
 * a resolved item + part. The item's own annotated responses act as the
 * boundary examples (credited = full-credit sample, not-credited = zero-credit
 * sample), since generated items carry their own graded exemplars.
 *
 * Output order is forced: error analysis -> feedback -> score -> confidence.
 */

import { chatComplete } from "@/lib/llm/client";
import {
  formatPartRubric,
  normalizeScore,
  extractFeedbackText,
  totalShortAnswerPoints,
} from "./common";
import type { MethodGradeInput, MethodGradeOutput } from "./types";
import type { GradingConfidence } from "@/types/short-answer";

interface Method3RawResponse {
  error_analysis?: Record<string, unknown>;
  feedback?: unknown;
  student_feedback?: unknown;
  formative_feedback?: unknown;
  feedback_message?: unknown;
  message?: unknown;
  hint?: unknown;
  guiding_question?: unknown;
  next_step?: unknown;
  score?: unknown;
  confidence?: unknown;
}

function normalizeConfidence(value: unknown): GradingConfidence {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "medium";
}

function buildBoundaryExamples(input: MethodGradeInput): string {
  const { item, part } = input;
  const pointsPossible = totalShortAnswerPoints(item);
  const full = item.annotatedResponses.find((r) => r.score === pointsPossible);
  const zero = item.annotatedResponses.find((r) => r.score === 0);
  if (!full && !zero) {
    return "(No boundary examples available for this part.)";
  }
  const lines: string[] = [];
  if (full) {
    lines.push(`Credited (full-credit) sample: "${full.response}"`);
    lines.push(`Why it earns credit: ${full.annotation}`);
  }
  if (zero) {
    lines.push(`Not-credited sample: "${zero.response}"`);
    lines.push(`Why it does not earn credit: ${zero.annotation}`);
  }
  lines.push(
    `Boundary rule for Part ${part.label}: apply the item rubric; credit requires the biological concept the rubric names, not surface wording.`,
  );
  return lines.join("\n");
}

function normalizeMethod3Feedback(
  parsed: Method3RawResponse,
  score: number,
  maxScore: number,
): string {
  const direct = extractFeedbackText(parsed.feedback);
  if (direct) return direct;

  const alternateKeys: Array<keyof Method3RawResponse> = [
    "student_feedback",
    "formative_feedback",
    "feedback_message",
    "message",
    "hint",
    "guiding_question",
    "next_step",
  ];
  for (const key of alternateKeys) {
    const text = extractFeedbackText(parsed[key]);
    if (text) return text;
  }

  return score >= maxScore
    ? "Your response addresses the main biological idea for this part. Check that your wording clearly connects your idea to the prompt."
    : "Your response needs a clearer connection to the biological idea this part is asking about. Reread the prompt and revise by explaining the relevant relationship, function, or mechanism.";
}

export async function gradeWithMethod3(
  input: MethodGradeInput,
): Promise<MethodGradeOutput> {
  const { item, part, studentResponse, modelId, temperature } = input;
  const t0 = Date.now();
  const partRubric = formatPartRubric(part);

  const systemPrompt = [
    "You are an expert Keystone Biology constructed-response grader.",
    "Use the item-specific rubric as the sole scoring authority.",
    "Boundary examples illustrate how to apply the rubric; they do not override it.",
    "Surface errors such as spelling, grammar, and minor wording issues must not affect the score unless they prevent meaning.",
    "",
    "Your output order is mandatory:",
    "1. error_analysis",
    "2. feedback",
    "3. score",
    "4. confidence",
    "",
    "Error analysis rules:",
    "- conceptual_errors: biological misconceptions or incorrect concepts that affect score.",
    "- reasoning_gaps: missing links, mechanisms, or required details that affect score.",
    "- surface_errors: spelling, grammar, or wording issues that do not affect score.",
    "- off_task_or_vague: responses that are too vague or do not answer the prompt.",
    "",
    "Feedback rules:",
    "- Write 1-3 student-facing sentences.",
    "- Keep feedback task-focused, specific to the student's response, and non-judgmental.",
    "- Prioritize elaborated feedback: briefly explain why the current response is or is not sufficient.",
    "- If the response has a useful partial idea, name that idea briefly; do not add generic praise.",
    "- Do not comment on the student's ability, effort, intelligence, confidence, or personality.",
    "- If the response is not full credit, do NOT give away the exact missing answer, correct term, or full solution.",
    "- Instead, provide one actionable next step and at most one guiding question.",
    "- Do not reveal rubric text, boundary example labels, scores, or internal analysis categories.",
    "- JSON contract: feedback must be one single student-facing string, not an object, array, list, or nested field.",
    "",
    `Score must be an integer from 0 to ${part.maxScore}.`,
    "",
    "Respond with ONLY valid JSON and no markdown:",
    '{"error_analysis":{"conceptual_errors":[],"reasoning_gaps":[],"surface_errors":[],"off_task_or_vague":[]},"feedback":"feedback string","score":0,"confidence":"high|medium|low"}',
  ].join("\n");

  const userPrompt = [
    `Question stimulus:\n${item.stem}`,
    "",
    `Part ${part.label} prompt (${part.maxScore} point${part.maxScore > 1 ? "s" : ""}):\n${part.prompt}`,
    "",
    `Item-specific rubric:\n${partRubric}`,
    "",
    `Boundary examples:\n${buildBoundaryExamples(input)}`,
    "",
    `Student response:\n${studentResponse.trim() || "(no response)"}`,
  ].join("\n");

  const completion = await chatComplete({
    model: modelId,
    temperature,
    jsonMode: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const parsed = JSON.parse(completion.content || "{}") as Method3RawResponse;
  const score = normalizeScore(parsed.score, part.maxScore);
  const feedback = normalizeMethod3Feedback(parsed, score, part.maxScore);

  return {
    score,
    feedback,
    confidence: normalizeConfidence(parsed.confidence),
    tokenCount: completion.tokenCount,
    latencyMs: Date.now() - t0,
  };
}
