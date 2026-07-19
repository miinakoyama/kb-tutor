/**
 * Method 2 — Two-stage LLM grading (default). Ported from the reference
 * project's lib/methods/method2.ts, adapted to take a resolved item + part.
 *
 * Stage 1 scores the part using its rubric and classifies fully-incorrect
 * responses by failure type. Stage 2 turns the Stage 1 result into
 * student-facing feedback. Both calls request JSON; tokenCount/latencyMs span
 * both calls.
 */

import { chatComplete } from "@/lib/llm/client";
import { formatPartRubric, normalizeScore, normalizeFeedback } from "./common";
import type { MethodGradeInput, MethodGradeOutput } from "./types";

interface Stage1Response {
  score: number;
  failure_type: string | null;
}

interface Stage2Response {
  feedback: string;
}

export async function gradeWithMethod2(
  input: MethodGradeInput,
): Promise<MethodGradeOutput> {
  const {
    item,
    part,
    studentResponse,
    modelId,
    temperature,
    isFinalSubmission = false,
  } = input;

  const t0 = Date.now();
  let totalTokens = 0;
  const partRubric = formatPartRubric(part);

  const stage1System = [
    "You are a scoring engine for Pennsylvania Keystone Biology",
    "constructed-response questions. You score student responses",
    "using item-specific scoring rubrics.",
    "",
    "YOUR ONLY JOB:",
    "Determine how many points the student's response earns for one",
    "part. Output a structured JSON score object only.",
    "Do not address the student. Do not provide feedback.",
    "Do not explain your reasoning in prose.",
    "",
    "THE CORE SCORING TEST:",
    "Ask exactly one question:",
    '"Is the correct biological concept present in this response?"',
    `Award an integer score from 0 to ${part.maxScore}.`,
    "",
    "The rubric's concept field defines what correct means.",
    "The student does not need exact wording or technical terms.",
    "Any accurate biological path to the same concept earns credit,",
    "including plain language descriptions.",
    "",
    "CEILING RULE:",
    "The concept field sets the ceiling, not the floor.",
    "Do NOT require scientific terminology if plain language conveys",
    "the same concept. Do NOT require multi-step explanations if the",
    "concept is stated simply. Do NOT require mechanisms the concept",
    "field does not mention. A short correct answer earns the same",
    "credit as a long one.",
    "",
    "PLAIN LANGUAGE RULE:",
    "Students are 9th-10th graders writing under timed conditions.",
    "Accept plain language equivalents of any concept the rubric lists.",
    "",
    "WHAT DOES NOT DISQUALIFY A RESPONSE:",
    "Spelling errors, grammar errors, plain language instead of",
    "scientific terminology, incomplete elaboration when the concept",
    "is present, brief responses when the concept is correct,",
    "circular phrasing when the correct concept is identifiable,",
    "additional incorrect information alongside a correct concept.",
    "",
    "FAILURE CLASSIFICATION (required when score is 0):",
    "Assign exactly one failure_type when score is 0:",
    '- "wrong_concept": student names a biologically incorrect concept',
    '- "vague": response contains no identifiable biological concept',
    '- "off_task": true biological fact but does not answer what was asked',
    '- "circular": response uses the conclusion as the reason',
    '- "copied_question": rephrases the question without adding biology',
    "",
    "SCORING RULE:",
    part.maxScore > 1
      ? `This part is worth ${part.maxScore} points. Award intermediate credit when the response addresses some, but not all, distinct scorable elements.`
      : "This part is worth exactly 1 point.",
    "",
    "Output JSON only, no markdown:",
    '{"score":0,"failure_type":null}',
  ].join("\n");

  const stage1User = [
    `Question stimulus: ${item.stem}`,
    "",
    `Part ${part.label} prompt: ${part.prompt}`,
    "",
    "Rubric:",
    partRubric,
    "",
    "Student response:",
    studentResponse.trim() || "(no response)",
  ].join("\n");

  const stage1Completion = await chatComplete({
    model: modelId,
    temperature,
    jsonMode: true,
    messages: [
      { role: "system", content: stage1System },
      { role: "user", content: stage1User },
    ],
  });
  totalTokens += stage1Completion.tokenCount;

  const stage1 = JSON.parse(stage1Completion.content || "{}") as Stage1Response;
  const score = normalizeScore(stage1.score, part.maxScore);

  const stage2System = [
    "You are a biology tutoring feedback agent for Keystone Biology",
    "constructed-response questions. Generate feedback for one",
    "scored part based on the score and failure type.",
    "",
    isFinalSubmission
      ? "FINAL SUBMISSION CONTEXT: No retry remains after this response."
      : "RETRY CONTEXT: The student will have another attempt after this response if it is not full credit.",
    "",
    `Full credit (${part.maxScore}/${part.maxScore}): Write one sentence confirming what the student got right.`,
    "Be specific — name what they said that earned the point.",
    "",
    ...(isFinalSubmission
      ? [
          "Any score below full credit:",
          "Briefly name any useful idea, then state what was incorrect or missing.",
          "Use declarative closure. Do not ask a question, invite revision, or tell the student to retry.",
          "The interface shows a canonical model answer next, so do not repeat the full solution.",
        ]
      : [
          "Partial credit (score > 0 but not full credit):",
          "State what the student got right, then name the missing idea needed for full credit.",
          "",
          "Score 0 — wrong_concept:",
          "Name what the student said. State it is not the right concept for this question. Redirect without giving the answer.",
          "",
          "Score 0 — vague:",
          "Acknowledge any direction if present. Ask one specific follow-up question pushing one level deeper toward naming a mechanism or structure.",
          "",
          "Score 0 — off_task:",
          "Name what their response describes. Clarify what the question is actually asking.",
          "",
          "Score 0 — circular:",
          "Tell the student their response uses the conclusion as the reason. Ask them to identify the underlying biological mechanism.",
          "",
          "Score 0 — copied_question:",
          "Tell the student they rephrased the question without adding biology. Ask them to explain the underlying science.",
        ]),
    "",
    "FEEDBACK LENGTH: Maximum 2 sentences per part.",
    isFinalSubmission
      ? "Do not duplicate the separate model answer."
      : "Never reveal the exact correct answer term while attempts remain.",
    "",
    "JSON contract: feedback must be one single student-facing string, not an object, array, list, or nested field.",
    "",
    "Output JSON only, no markdown:",
    '{"feedback":"feedback string"}',
  ].join("\n");

  const stage2User = [
    `Question stimulus: ${item.stem}`,
    "",
    `Part ${part.label} prompt: ${part.prompt}`,
    "",
    "Rubric:",
    partRubric,
    "",
    "Student response:",
    studentResponse.trim() || "(no response)",
    "",
    "Scoring result:",
    JSON.stringify({ score, failure_type: stage1.failure_type ?? null }, null, 2),
  ].join("\n");

  const stage2Completion = await chatComplete({
    model: modelId,
    temperature,
    jsonMode: true,
    messages: [
      { role: "system", content: stage2System },
      { role: "user", content: stage2User },
    ],
  });
  totalTokens += stage2Completion.tokenCount;

  const stage2 = JSON.parse(stage2Completion.content || "{}") as Stage2Response;

  return {
    score,
    feedback: normalizeFeedback(stage2.feedback),
    diagnosedGap: stage1.failure_type ?? undefined,
    tokenCount: totalTokens,
    latencyMs: Date.now() - t0,
  };
}
