# Reference: AIG Generation & Feedback Pipeline (verbatim technical spec)

This document preserves the detailed technical reference the user supplied with the
`/speckit-specify` request. It is the authoritative behavioral reference for the
planning phase. The feature `spec.md` intentionally states capabilities only; the
concrete schemas, prompts, and dispatch logic live here.

Reference implementation source: https://github.com/cocoj1115/mvp4-internal-testing
Relevant branches observed: `main`, `feat/aig-generation`, `method-1`, `method-2`, `method-3`, `eval-dashboard`.

---

## Part 1 — AIG item generation (no-RAG Method2 approach)

Implement the AIG item-generation pipeline using the no-RAG Method2 approach.

**Goal:** Build a Pennsylvania Keystone Biology constructed-response item generator. Use the two-stage Method2 pipeline:
1. Generate an item blueprint.
2. Generate the final item from that blueprint.

Use the no-study-guide-RAG variant. This corresponds to:
- Blueprint: ON
- Study-guide RAG: OFF
- TELeR level: L3
- Style-check retry: OFF by default
- Method1: not used as the primary generator

Do not retrieve or inject study-guide chunks into either blueprint generation or item generation. The generator should rely on:
- target standard
- selected core KC
- all KCs under the target standard
- KC vocabulary
- taxonomy/task-type definitions
- A/B/C sequence priors from existing item cards
- whole-item exemplars
- rubric anchors
- fixed or selected stimulus type

### Pipeline

**1. Input** — Accept: `standardCode`, optional `fixedCoreKC`, optional `stimulusType`, `model`, `temperature`.
If `fixedCoreKC` is not provided, select one valid KC under the standard.
If `stimulusType` is not provided, select from: `table, line_graph, bar_chart, diagram, scenario, illustration`. Do not use "none" for normal item generation.

**2. Assemble no-RAG context** — Load KCs for the standard, selected core KC, taxonomy rows, existing item cards, whole-item exemplars, rubric anchors.
Set: `studyGuideChunks = []`, `grounding.study_guide.empty = true`, `grounding.study_guide.chunk_ids = []`.
Do not call embedding retrieval. Do not load or query `study_guide_chunks.json`. Do not put study-guide text into prompts.
Select related item cards by simple vocabulary overlap with the selected core KC vocabulary. Use them only as task-type/style priors, not as copied content.

**3. Blueprint generation** — Generate a strict JSON blueprint.

```json
{
  "target_standard": "<standard code>",
  "anchor_kc": "<selected core KC code>",
  "core_kc": "<same as anchor_kc>",
  "selected_kcs": ["<KC codes used in Part A/B/C>"],
  "supporting_kcs": ["<optional supporting KC codes>"],
  "stem_affordance": "<shared context/stimulus affordance>",
  "compatibility_rationale": "<why the selected KCs work together>",
  "cognitive_demand": "<Low | Low-Mod | Moderate | High>",
  "key_concepts": ["<concepts from KC statement/vocab>"],
  "task_sequence": {
    "Part A": { "kc_code": "<KC code>", "task_type": "<taxonomy type>", "function": "<single focused target>" },
    "Part B": { "kc_code": "<KC code>", "task_type": "<taxonomy type>", "function": "<single mechanism/reasoning target>" },
    "Part C": { "kc_code": "<KC code>", "task_type": "<taxonomy type>", "function": "<single transfer/evaluation target>" }
  },
  "stimulus_type": "<table|line_graph|bar_chart|scenario|diagram|illustration>",
  "evidence_pattern": "<planned evidence/stimulus form>",
  "expected_response_elements": ["<required response element>"],
  "common_incomplete_responses": ["<typical error or omission>"]
}
```

Rules:
- `anchor_kc` must equal the selected core KC. `core_kc` must equal `anchor_kc`.
- `selected_kcs` must include every KC used in `task_sequence`. Each part gets exactly one KC.
- Default to 3 parts. Use 2 parts only if a third part would be redundant.
- Part A low-entry and convergent; Part B one mechanism/relationship; Part C one prediction/application/evaluation.
- Difficulty must not decrease across parts. Do not chain multiple asks inside one part. Keep all parts coherent with one shared stem/stimulus.
- Validate the blueprint. Retry generation if invalid.

**4. Item generation** — Generate the final constructed-response item from the validated blueprint.

```json
{
  "stem": "<biological context sentence(s)>",
  "stimulus_asset": {
    "type": "<same as blueprint.stimulus_type>",
    "title": "<short Keystone-style figure title>",
    "table_markdown": "<only for table>",
    "chart_data": {
      "x_label": "<axis label>",
      "y_label": "<axis label>",
      "series": [ { "name": "<series name>", "points": [["<x>", 0]] } ]
    },
    "diagram_spec": "<complete SVG string only for diagram>",
    "scenario_text": "<only for scenario>",
    "illustration_prompt": "<only for illustration>"
  },
  "parts": {
    "Part A": { "task_type": "<from blueprint>", "question": "<student-facing question>" },
    "Part B": { "task_type": "<from blueprint>", "question": "<student-facing question>" },
    "Part C": { "task_type": "<from blueprint>", "question": "<student-facing question>" }
  },
  "part_rubrics": {
    "Part A": { "points_possible": 1, "criteria": { "1": "<Part A credit criterion>", "0": "<no-credit criterion>" } },
    "Part B": { "points_possible": 1, "criteria": { "1": "<Part B credit criterion>", "0": "<no-credit criterion>" } },
    "Part C": { "points_possible": 1, "criteria": { "1": "<Part C credit criterion>", "0": "<no-credit criterion>" } }
  },
  "annotated_responses": [
    { "score": 3, "response": "<full-credit sample student response>", "annotation": "<why it earns 3>" },
    { "score": 2, "response": "<two-point sample student response>", "annotation": "<why it earns 2>" },
    { "score": 1, "response": "<one-point sample student response>", "annotation": "<why it earns 1>" },
    { "score": 0, "response": "<zero-point sample student response>", "annotation": "<why it earns 0>" }
  ]
}
```

Rules:
- `stimulus_asset.type` must exactly match `blueprint.stimulus_type`.
- Every part must match the blueprint `task_type` and KC function. Each part asks exactly one thing.
- Stem/stimulus/questions must not leak expected answers. Rubrics must be concrete and biology-specific.
- `part_rubrics` `points_possible` values must sum to 3. `annotated_responses` must include scores 0, 1, 2, and 3.
- Do not leave placeholders like `[Part A concept]` or angle-bracket template text. Use a specific, plausible biology context when possible.

**5. Stimulus rules**
- All stimuli: black/white/gray Keystone worksheet style; no decorative color, gradients, or shadows; title rendered separately by the app.
- table: provide `table_markdown` only.
- line_graph / bar_chart: provide `chart_data` only; clear labels and realistic numeric values.
- scenario: provide `scenario_text` only; include concrete observations or measurements.
- diagram: provide complete safe inline SVG in `diagram_spec`; no script/event handlers; readable non-overlapping labels.
- illustration: provide `illustration_prompt` only; optional downstream image generation may convert it to `image_b64`; do not require multimodal judging for generation.

**6. Validation** (before returning the item): required blueprint keys exist; anchor/core KC valid; `selected_kcs` valid; `task_sequence` part KCs valid; task types are valid taxonomy names; stimulus type valid; final item has stem, stimulus_asset, parts, part_rubrics, annotated_responses; stimulus asset has required field for its type; part rubrics exist for every generated part; rubric points sum to 3; annotated responses include 0/1/2/3; no unresolved placeholders. Use retry-on-invalid-output around both LLM calls.

**7. Output**

```json
{
  "blueprint": { },
  "item": { },
  "grounding": {
    "study_guide": { "empty": true, "chunk_ids": [] },
    "rubric": { "empty": false, "items": [] },
    "cards": { "empty": false, "card_ids": [] }
  },
  "metadata": {
    "method": "method2_blueprint_no_rag_l3",
    "useBlueprint": true,
    "useStudyGuideRag": false,
    "telerLevel": 3
  }
}
```

### Selectable generation models
Claude Sonnet, Claude Opus, GPT 5.4, GPT 5.4 mini, Gemini 3.1 Flash Lite.

---

## Part 2 — Feedback generation (Methods 1, 2, 3)

Purpose: for each sub-part student response return `score`, `feedback`, and `diagnosedGap` / `tokenCount` / `latencyMs` / `confidence` as applicable.

### Recommended defaults
- Method 1: Opus 4.8, Temp 1
- Method 2: GPT 5.4, Temp 1
- Method 3: Sonnet 4.6, Temp 0

### Common types

```ts
type PartLabel = "A" | "B" | "C";

type QuestionPart = {
  label: PartLabel;
  prompt: string;
  taskType?:
    | "recall_identify"
    | "explain_mechanism"
    | "evaluation_justification"
    | "experimental_design"
    | "apply_concept"
    | "synthesis_design";
  maxScore: number;
  scoringGuidance: string;
};

type Question = {
  id: string;
  standard: string;
  stem: string;
  parts: QuestionPart[];
};

type GradingModelConfig = {
  provider: "openai" | "anthropic" | "google";
  modelId: string;
  temperature: number;
};
```

### Common LLM call
`callLlm({ provider, modelId, temperature, jsonMode, messages })`.
- OpenAI: `response_format: { type: "json_object" }`.
- Anthropic: add `Respond with ONLY valid JSON. No markdown...` to system prompt; strip ```json fences and surrounding prose to extract the JSON object.
- Google/Gemini: `responseMimeType: "application/json"`.

All methods `JSON.parse()` the LLM reply. Score is always rounded into `0..part.maxScore`.

```ts
function normalizeScore(value: unknown, maxScore: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(maxScore, Math.round(value)));
}
```

Feedback extraction preferred keys (so nested/array replies don't break):
```ts
const preferredKeys = [
  "feedback", "student_feedback", "message", "text",
  "hint", "cue", "guiding_question", "next_step",
];
```

### Method 1 — GradeOpt + RAG + single-call grading/feedback
Single LLM call produces score, student-state classification, feedback, diagnosed gap simultaneously. Strongest prompt control; detailed feedback style/length/scaffolding rules.

Additional input:
```ts
type Method1Options = {
  adaptationRules: string | null;
  kbContext: { kd1: string; kd2: string; ke: string } | null;
  priorGaps: Record<string, string>;
  taskType: QuestionPart["taskType"];
  temperature?: number;
  part: { prompt: string; maxScore: number; scoringGuidance: string };
  questionStem: string;
};
```

Preprocessing: use GradeOpt rules if `adaptationRules` present; use RAG context if `kbContext` present; `priorGaps` inform feedback coherence but not score; `part.maxScore > 1` → multi-point.

RAG (optional; existing impl retrieves 3 kinds):
- KD1: STEELS standard context; KD2: scoring rubric context; KE: similar scored examples.
- Embed `part.prompt` and `studentResponse`. KD1/KD2 by prompt-embedding cosine top-k. KE by response-embedding cosine top-5, rerank `0.6*cosine + 0.4*wordOverlap`. Join top 2 of each collection with `\n---\n`.
- Note: original `retrieveFromKB` reads `data/gstar/kb/...`; falls back to null if data absent. On port, point at real data path (e.g. `data/kb/...`).

System prompt highlights:
```
Expert biology teacher grading Pennsylvania Keystone Biology CR item
scoring rules: question-form answer = 0 points; recall_identify may earn full credit with a word/phrase; otherwise a declarative sentence is required; GradeOpt adaptation rules override base guidance; KB context must not expand scoring criteria.
feedback style: warm and encouraging; max 35 words; short/direct sentences; score=0 acknowledges something good then pivots with "but"; score=full is exactly one confirmatory sentence; never start with "I", "The missing step", "Your response", "This response".
student state classification: blank | wrong_concept | missing_mechanism | missing_specificity | partial_credit | correct.
planning: studentAnchor = shortest useful phrase from response; score full → decide correctnessTarget, one-sentence feedback; score 0 → build specificityTarget and hintTarget; hintTarget scaffolds without using the final answer term.
score=0 constraints: exactly one question mark; exactly one teaching move; recall_identify must not reveal final answer term; do not use "incorrect"/"wrong"/"you need to"; do not reference rubric or other parts; max 2 sentences.
```

User prompt:
```
QUESTION STEM:
{questionStem}

SUB-PART {partLabel} (worth {maxScore} pt/pts):
{part.prompt}

SCORING GUIDANCE:
{part.scoringGuidance}
```
If `adaptationRules` present, replace SCORING GUIDANCE with:
```
GRADEOPT ADAPTATION RULES:
{adaptationRules}
```
Then append when present:
```
PRIOR PART GAPS:
Part A: ...
Part B: ...

STEELS STANDARD CONTEXT:
{kbContext.kd1}

SCORING RUBRIC CONTEXT:
{kbContext.kd2}

SIMILAR SCORED EXAMPLES:
{kbContext.ke}

STUDENT RESPONSE:
{studentResponse.trim()}
```

Output JSON:
```json
{
  "reasoning": "2-4 sentences internal reasoning",
  "score": 0,
  "studentState": "blank | wrong_concept | missing_mechanism | missing_specificity | partial_credit | correct",
  "studentAnchor": "short phrase or null",
  "specificityTarget": "internal only",
  "hintTarget": "internal only",
  "feedbackDraft": "internal draft",
  "feedback": "student-facing feedback",
  "diagnosedGap": "string or none"
}
```
Return:
```ts
{ score: normalizeScore(parsed.score, part.maxScore),
  feedback: parsed.feedback || "No feedback returned.",
  diagnosedGap: parsed.diagnosedGap || "none",
  tokenCount }
```

### Method 2 — Two-stage LLM grading
Separate scoring from feedback. Stage 1: score + failure type only. Stage 2: feedback only, using Stage 1 result.

Stage 1 system prompt highlights:
```
You are a scoring engine for Pennsylvania Keystone Biology constructed-response questions.
Your only job is to determine how many points the student's response earns for one part.
Output JSON only. Do not address the student. Do not provide feedback.
Core scoring test: "Is the correct biological concept present in this response?"
Award integer score from 0 to {part.maxScore}. The rubric's concept field defines what correct means.
Ceiling rule: do not require scientific terminology if plain language conveys the same concept; do not require mechanisms the concept field does not mention; short correct answers earn the same credit as long ones.
Do not disqualify for spelling, grammar, plain language, brief responses, or extra incorrect info if the correct concept is identifiable.
If score is 0, assign exactly one failure_type: wrong_concept | vague | off_task | circular | copied_question.
```
Stage 1 user prompt:
```
Question stimulus: {question.stem}

Part {partLabel} prompt: {part.prompt}

Rubric:
{part.scoringGuidance}

Student response:
{response.trim() || "(no response)"}
```
Stage 1 output: `{ "score": 0, "failure_type": "wrong_concept | vague | off_task | circular | copied_question | null" }`

Stage 2 system prompt highlights:
```
You are a biology tutoring feedback agent for Keystone Biology constructed-response questions.
Generate feedback for one scored part based on the score and failure type.
Full credit: one sentence confirming what the student got right; be specific.
Partial credit: state what they got right, then name the missing idea needed for full credit.
Score 0 wrong_concept: name what they said; state it is not the right concept; redirect without giving the answer.
Score 0 vague: acknowledge any direction if present; ask one specific follow-up pushing one level deeper.
Score 0 off_task: name what their response describes; clarify what the question is actually asking.
Score 0 circular: say the response uses the conclusion as the reason; ask for the underlying biological mechanism.
Score 0 copied_question: say they rephrased the question without adding biology; ask them to explain the underlying science.
Maximum 2 sentences. Return JSON only. feedback must be one single student-facing string.
```
Stage 2 user prompt:
```
Question stimulus: {question.stem}

Part {partLabel} prompt: {part.prompt}

Rubric:
{part.scoringGuidance}

Student response:
{response.trim() || "(no response)"}

Scoring result:
{JSON.stringify(stage1, null, 2)}
```
Stage 2 output: `{ "feedback": "feedback string" }`
Return:
```ts
{ score: normalizeScore(stage1.score, part.maxScore),
  feedback: normalizeFeedback(stage2.feedback),
  tokenCount: stage1Tokens + stage2Tokens,
  latencyMs: Date.now() - t0 }
```

### Method 3 — Error-aware feedback-first grading with boundary examples
Force order: error analysis → feedback → score → confidence. Include Keystone sampler boundary examples to stabilize the credit/no-credit boundary.

Boundary examples (hardcoded per question ID + part):
```ts
type BoundaryExample = { credited: string; notCredited: string; boundary: string };
```
Example:
```ts
{
  credited: "With less light, the pupils dilate and become larger to let in more light.",
  notCredited: "The eye would have to adjust between the dimness of the lights.",
  boundary: "Credit names the compensating response to dim light, especially pupil dilation; do not credit generic adjustment without the response."
}
```
Boundary examples do not override the rubric; they only aid rubric application.

System prompt highlights:
```
You are an expert Keystone Biology constructed-response grader.
Use the item-specific rubric as the sole scoring authority.
Boundary examples illustrate how to apply the rubric; they do not override it.
Surface errors (spelling, grammar, minor wording) must not affect the score unless they prevent meaning.
Mandatory output order: 1. error_analysis 2. feedback 3. score 4. confidence.
Error analysis: conceptual_errors, reasoning_gaps, surface_errors, off_task_or_vague.
Feedback rules: 1-3 student-facing sentences; task-focused, specific, non-judgmental; briefly explain why response is/ isn't sufficient; implicitly address (1) what the prompt asks (2) how the response matches/misses it (3) what revision move to try next; if partially useful, name the useful idea briefly; no generic praise; no comments on ability/effort/personality; if not full credit, do not give away exact missing answer/correct term/full solution; one actionable next step; at most one guiding question; conceptual error → point out mismatch without naming correct concept; reasoning gap → ask for missing relationship/mechanism/evidence/comparison; vague/off-task → redirect to what prompt asks; do not reveal rubric text, boundary labels, scores, or internal analysis categories; feedback must be one single string.
Score integer from 0 to {part.maxScore}. Return JSON only.
```
User prompt:
```
Question stimulus:
{question.stem}

Part {partLabel} prompt ({part.maxScore} point/points):
{part.prompt}

Item-specific rubric:
{part.scoringGuidance}

Boundary examples from the Keystone sampler:
{formattedBoundaryExamples}

Student response:
{studentResponse.trim() || "(no response)"}
```
`formattedBoundaryExamples`:
```
Boundary Pair 1
Credited response: "{credited}"
Not credited response: "{notCredited}"
Boundary rule: {boundary}
```
If none: `(No boundary examples available for this part.)`

Output JSON:
```json
{
  "error_analysis": {
    "conceptual_errors": [],
    "reasoning_gaps": [],
    "surface_errors": [],
    "off_task_or_vague": []
  },
  "feedback": "feedback string",
  "score": 0,
  "confidence": "high | medium | low"
}
```
Fallback: if feedback is not a direct string, extract from `student_feedback, formative_feedback, feedback_message, message, hint, guiding_question, next_step`. Otherwise:
- full credit: `"Your response addresses the main biological idea for this part. Check that your wording clearly connects your idea to the prompt."`
- not full credit: `"Your response needs a clearer connection to the biological idea this part is asking about. Reread the prompt and revise by explaining the relevant relationship, function, or mechanism."`
`confidence` other than high/medium/low → `"medium"`.
Return:
```ts
{ score: normalizeScore(parsed.score, part.maxScore), feedback, confidence, tokenCount, latencyMs: Date.now() - t0 }
```

### API dispatch
`POST /api/grade` (example):
```ts
type GradeRequest = {
  questionId: string;
  partLabel: "A" | "B" | "C";
  studentResponse: string;
  method?: "1" | "2" | "3";
  modelConfig?: GradingModelConfig;
  attemptNumber?: 1 | 2;
  attempt1Feedback?: string;
  attempt1Gap?: string;
  priorGaps?: Record<string, string>;
  taskType?: QuestionPart["taskType"];
};
```
Empty response returns immediately without calling the LLM:
```json
{ "score": 0, "feedback": "No response was submitted.", "diagnosedGap": "Student submitted empty response." }
```
Dispatch:
```ts
if (method === "2") {
  result = await gradeWithMethod2(questionId, partLabel, studentResponse, modelConfig);
  diagnosedGap = result.score >= part.maxScore ? "none" : result.feedback;
} else if (method === "3") {
  result = await gradeWithMethod3(questionId, partLabel, studentResponse, modelConfig);
  diagnosedGap = result.score >= part.maxScore ? "none" : result.feedback;
} else {
  const adaptationRules = getAdaptationRules(question.standard, partLabel);
  const kbContext = await retrieveFromKB(part.prompt, studentResponse, 2);
  result = await gradeWithMethod1(questionId, partLabel, studentResponse, modelConfig.modelId, {
    adaptationRules, kbContext, priorGaps: priorGaps ?? {}, taskType,
    temperature: modelConfig.temperature,
    part: { prompt: part.prompt, maxScore: part.maxScore, scoringGuidance: part.scoringGuidance },
    questionStem: question.stem
  });
  diagnosedGap = result.diagnosedGap;
}
```

### Key differences
- Method 1: 1 call; strongest prompt engineering; feedback + diagnosedGap together; uses GradeOpt rules and RAG.
- Method 2: 2 calls; Stage 1 score/failure_type only, Stage 2 feedback only; most decoupled design.
- Method 3: 1 call; boundary examples; error_analysis first, then feedback/score/confidence; confidence usable for UI flagging.
