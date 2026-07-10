/**
 * Method 1 — Single-call grading with knowledge-base context (RAG).
 * Ported from the reference project's lib/methods/method1.ts, adapted to take
 * a resolved item + part. GradeOpt adaptation rules are not available in this
 * app, so the base scoring guidance is always used; KB context is retrieved
 * from the bundled embeddings when available and degrades gracefully to null.
 *
 * A single JSON call returns a chain-of-thought plan plus the final score,
 * student feedback, and a diagnosed gap.
 */

import { chatComplete } from "@/lib/llm/client";
import { retrieveFromKB } from "./retrieval";
import { formatPartRubric } from "./common";
import type { MethodGradeInput, MethodGradeOutput } from "./types";

interface Method1Parsed {
  reasoning?: string;
  score?: unknown;
  studentState?: string;
  studentAnchor?: string;
  specificityTarget?: string;
  hintTarget?: string;
  feedbackDraft?: string;
  feedback?: string;
  diagnosedGap?: string;
}

export async function gradeWithMethod1(
  input: MethodGradeInput,
): Promise<MethodGradeOutput> {
  const { item, part, studentResponse, modelId, temperature, priorGaps } = input;
  const t0 = Date.now();

  const kbContext = await retrieveFromKB(part.prompt, studentResponse.trim());
  const useKB = kbContext !== null;
  const isMultiPoint = part.maxScore > 1;
  const taskType = part.taskType;
  const gaps = priorGaps ?? {};
  const partRubric = formatPartRubric(part);

  const receiveItems: string[] = [
    "1. The question stem",
    "2. The sub-part prompt",
    "3. Official scoring guidance",
  ];
  let itemNum = 3;
  if (useKB) {
    receiveItems.push(`${++itemNum}. STEELS standard context (KD1)`);
    receiveItems.push(`${++itemNum}. Scoring rubric context (KD2)`);
    receiveItems.push(`${++itemNum}. Similar scored examples (KE)`);
  }
  receiveItems.push(`${++itemNum}. Student response`);

  const scoringSystemPrompt = [
    "You are an expert biology teacher grading a Pennsylvania Keystone Biology Constructed Response (CR) item.",
    "",
    "You will receive:",
    ...receiveItems,
    "",
    "SCORING RULES:",
    "• CRITICAL: A response phrased as a question (e.g. 'DNA?', 'the ribosome?') scores 0 regardless of content — uncertainty is not understanding.",
    isMultiPoint
      ? `• This part is worth ${part.maxScore} points. Award 0, 1, or ${part.maxScore} based on distinct scorable elements.`
      : "• This part is worth 1 point. Award 0 or 1.",
    "• Base your score on the scoring guidance.",
    useKB
      ? "• Use the STEELS standard context ONLY to understand the biological domain — do NOT use it to expand the scoring criteria beyond what the sub-part prompt explicitly asks."
      : null,
    useKB ? "• Use the scoring rubric context to apply the correct criteria." : null,
    useKB ? "• Use the scored examples as reference — find the closest match to the student's response." : null,
    Object.keys(gaps).length > 0
      ? "• Prior part gaps are provided for context only. Use them to make feedback more coherent across parts, but do not change the score based on prior gaps."
      : null,
    "",
    "FEEDBACK STYLE:",
    "- Tone: warm and encouraging, like a supportive biology teacher.",
    "- Maximum 35 words total.",
    "- Keep sentences short and direct.",
    "- For score=0: acknowledge what the student got partially right before redirecting. Use 'but' to pivot. Ask exactly one guiding question. Do NOT reveal the final answer term.",
    "- For score=full: write exactly ONE confirmatory sentence naming what the student got right.",
    "- Never start with 'I', 'The missing step', 'Your response', or 'This response'.",
    "",
    "diagnosedGap: the single most important reasoning step or concept the student failed to demonstrate.",
    "Format: '[Student wrote X] but [correct concept] is required because [one-line biological reason].'",
    "Write 'none' if score equals maximum points.",
    "",
    "Respond with ONLY valid JSON in this exact format:",
    "{",
    '  "reasoning": "<2-4 sentences>",',
    '  "score": <integer>,',
    '  "studentState": "<blank | wrong_concept | missing_mechanism | missing_specificity | partial_credit | correct>",',
    '  "studentAnchor": "<shortest useful phrase from student response, or null>",',
    '  "hintTarget": "<score=0 only: needed concept rephrased WITHOUT the final answer term>",',
    '  "feedback": "<final student-facing feedback>",',
    '  "diagnosedGap": "<string>"',
    "}",
    "reasoning, studentAnchor, and hintTarget are internal only — never shown to the student.",
    `The taskType for this part is: ${taskType}`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  const scoringUserParts = [
    `QUESTION STEM:\n${item.stem}`,
    `SUB-PART ${part.label} (worth ${part.maxScore} pt${part.maxScore > 1 ? "s" : ""}):\n${part.prompt}`,
    `SCORING GUIDANCE:\n${partRubric}`,
    Object.keys(gaps).length > 0
      ? `PRIOR PART GAPS (context only):\n${Object.entries(gaps)
          .map(([label, gap]) => `Part ${label}: ${gap}`)
          .join("\n")}`
      : null,
    kbContext ? `STEELS STANDARD CONTEXT:\n${kbContext.kd1}` : null,
    kbContext ? `SCORING RUBRIC CONTEXT:\n${kbContext.kd2}` : null,
    kbContext ? `SIMILAR SCORED EXAMPLES:\n${kbContext.ke}` : null,
    `STUDENT RESPONSE:\n${studentResponse.trim() || "(no response)"}`,
  ].filter((l): l is string => Boolean(l));

  const completion = await chatComplete({
    model: modelId,
    temperature,
    jsonMode: true,
    messages: [
      { role: "system", content: scoringSystemPrompt },
      { role: "user", content: scoringUserParts.join("\n\n") },
    ],
  });

  const parsed = JSON.parse(completion.content || "{}") as Method1Parsed;
  const rawScore = typeof parsed.score === "number" ? parsed.score : 0;
  const score = Math.max(0, Math.min(part.maxScore, Math.round(rawScore)));
  const diagnosedGap =
    typeof parsed.diagnosedGap === "string" && parsed.diagnosedGap.trim()
      ? parsed.diagnosedGap.trim()
      : "none";
  const feedback =
    typeof parsed.feedback === "string" && parsed.feedback.length > 0
      ? parsed.feedback
      : "No feedback returned.";

  return {
    score,
    feedback,
    diagnosedGap: diagnosedGap === "none" ? undefined : diagnosedGap,
    tokenCount: completion.tokenCount,
    latencyMs: Date.now() - t0,
  };
}
