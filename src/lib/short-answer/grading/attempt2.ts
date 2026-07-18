/**
 * Attempt-2 feedback pipeline from the reference project (mvp4-internal-testing
 * lib/attempt2.ts). After the configured grading method scores attempt 2, this
 * module classifies gap resolution and generates method-independent feedback.
 */

import { chatComplete } from "@/lib/llm/client";

export type Attempt2Resolution = "fully" | "partially" | "not_at_all";

export async function classifyResolution(params: {
  attempt1Gap: string;
  attempt2Response: string;
  modelId: string;
  temperature: number;
}): Promise<Attempt2Resolution> {
  const completion = await chatComplete({
    model: params.modelId,
    temperature: params.temperature,
    messages: [
      {
        role: "system",
        content:
          "Classify whether a student's revised biology response addresses a specific reasoning gap. Respond with exactly one of: fully / partially / not_at_all",
      },
      {
        role: "user",
        content: `Gap from attempt 1: ${params.attempt1Gap}\n\nStudent attempt 2: ${params.attempt2Response}`,
      },
    ],
  });

  const raw = completion.content.trim().toLowerCase();
  if (
    raw.startsWith("not") ||
    raw.includes("not_at_all") ||
    raw.includes("not at all")
  ) {
    return "not_at_all";
  }
  if (raw.startsWith("partial") || raw.includes("partial")) {
    return "partially";
  }
  return "fully";
}

export interface Attempt2FeedbackInput {
  resolution: Attempt2Resolution;
  attempt1Feedback: string;
  attempt1Gap: string;
  /** Full-credit rubric criteria for the part — the model answer to teach. */
  fullCreditCriteria: string;
  questionStem: string;
  partLabel: string;
  partPrompt: string;
  studentResponse: string;
  modelId: string;
  temperature: number;
}

function feedbackInstruction(resolution: Attempt2Resolution): string {
  switch (resolution) {
    case "fully":
      return [
        "IF resolution = fully:",
        "The student has now correctly answered the question and made clear progress from attempt 1.",
        "First, briefly recognize the effort or improvement (e.g. 'You revised this well.' or 'Nice improvement.'). Then name the specific concept they correctly identified. 1-2 sentences.",
      ].join("\n");
    case "partially":
      return [
        "IF resolution = partially:",
        "The student made some progress but did not fully close the gap.",
        "First, recognize what changed or improved from attempt 1 (be specific, not generic). Then, in the next sentence, teach the rest of the answer: state the remaining missing idea directly as a fact, drawn from the CORRECT ANSWER, so the student learns it. Do not hint — complete the reasoning.",
        "Do not ask a question. Maximum 2 sentences. No question mark.",
      ].join("\n");
    default:
      return [
        "IF resolution = not_at_all:",
        "This is the student's final attempt and it is still incorrect — teach them the answer now.",
        "First, briefly acknowledge the effort (one short phrase). Then teach the correct answer: state the key idea from the CORRECT ANSWER directly as a declarative sentence so the student learns what they missed.",
        "Format: '[One word of acknowledgment for the effort.] [The correct idea stated directly.]'",
        "Do not ask a question. Maximum 2 sentences. No question mark.",
      ].join("\n");
  }
}

export async function generateAttempt2Feedback(
  input: Attempt2FeedbackInput,
): Promise<{ feedback: string; tokenCount: number; latencyMs: number }> {
  const t0 = Date.now();
  const {
    resolution,
    attempt1Feedback,
    attempt1Gap,
    fullCreditCriteria,
    questionStem,
    partLabel,
    partPrompt,
    studentResponse,
    modelId,
    temperature,
  } = input;

  const completion = await chatComplete({
    model: modelId,
    temperature,
    messages: [
      {
        role: "system",
        content: [
          "You are giving targeted feedback on a student's second attempt at a Keystone Biology question.",
          "This is the student's LAST attempt: they will not answer again, so it is correct to reveal and teach the answer here.",
          "",
          `Gap resolution: ${resolution}`,
          "",
          feedbackInstruction(resolution),
          "",
          `HARD CONSTRAINT: Do not reuse any phrases, sentence structures, or vocabulary from this previous feedback: "${attempt1Feedback}"`,
          "",
          "Return only the feedback text. No JSON, no labels.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Question: ${questionStem}`,
          `Part ${partLabel}: ${partPrompt}`,
          `CORRECT ANSWER (full-credit criteria for this part): ${fullCreditCriteria}`,
          `What was missing (attempt 1): ${attempt1Gap}`,
          `Student attempt 2 response: ${studentResponse}`,
        ].join("\n"),
      },
    ],
  });

  return {
    feedback: completion.content.trim() || "No feedback returned.",
    tokenCount: completion.tokenCount,
    latencyMs: Date.now() - t0,
  };
}

export async function buildAttempt2StudentFeedback(params: {
  attempt1Feedback: string;
  attempt1Gap: string;
  /** Full-credit rubric criteria for the part — the model answer to teach. */
  fullCreditCriteria: string;
  itemStem: string;
  partLabel: string;
  partPrompt: string;
  studentResponse: string;
  modelId: string;
  temperature: number;
  fallbackGap?: string;
}): Promise<{
  feedback: string;
  resolution: Attempt2Resolution;
  tokenCount: number;
  latencyMs: number;
}> {
  // Methods differ in the gap they diagnose: method 1 gives a rich concept-level
  // gap, method 2 only a failure-type code, method 3 none at all. Fall back to
  // the part's full-credit criteria so classification and teaching always have
  // the correct answer to work from.
  const gap =
    params.attempt1Gap.trim() ||
    params.fallbackGap?.trim() ||
    params.fullCreditCriteria;
  const resolution = await classifyResolution({
    attempt1Gap: gap,
    attempt2Response: params.studentResponse,
    modelId: params.modelId,
    temperature: params.temperature,
  });

  const generated = await generateAttempt2Feedback({
    resolution,
    attempt1Feedback: params.attempt1Feedback,
    attempt1Gap: gap,
    fullCreditCriteria: params.fullCreditCriteria,
    questionStem: params.itemStem,
    partLabel: params.partLabel,
    partPrompt: params.partPrompt,
    studentResponse: params.studentResponse,
    modelId: params.modelId,
    temperature: params.temperature,
  });

  return {
    feedback: generated.feedback,
    resolution,
    tokenCount: generated.tokenCount,
    latencyMs: generated.latencyMs,
  };
}
