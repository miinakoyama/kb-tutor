/**
 * Short-answer (constructed-response) content types.
 *
 * Items are stored in `generated_questions.payload` (and assignment snapshots)
 * as `payload.shortAnswer` with `payload.questionType === "open-ended"`.
 * See specs/002-short-answer-questions/data-model.md §1.
 */

export type PartLabel = "A" | "B" | "C";

/**
 * Task type is a taxonomy name from the bundled task-type taxonomy
 * (src/data/short-answer/taxonomy_and_cards.json), e.g.
 * "Recall / Identify / Classify", "Explain Mechanism", "Prediction".
 * Validated against the taxonomy keys at generation time.
 */
export type TaskType = string;

export type StimulusType =
  | "table"
  | "line_graph"
  | "bar_chart"
  | "diagram"
  | "scenario"
  | "illustration";

export interface ChartSeries {
  name: string;
  points: [number | string, number][];
}

export interface ChartData {
  xLabel: string;
  yLabel: string;
  series: ChartSeries[];
}

interface StimulusBase {
  title: string;
}

export interface TableStimulus extends StimulusBase {
  type: "table";
  tableMarkdown: string;
}

export interface LineGraphStimulus extends StimulusBase {
  type: "line_graph";
  chartData: ChartData;
}

export interface BarChartStimulus extends StimulusBase {
  type: "bar_chart";
  chartData: ChartData;
}

export interface DiagramStimulus extends StimulusBase {
  type: "diagram";
  diagramSvg: string;
}

export interface ScenarioStimulus extends StimulusBase {
  type: "scenario";
  scenarioText: string;
}

export interface IllustrationStimulus extends StimulusBase {
  type: "illustration";
  illustrationPrompt: string;
  /** Base64-encoded PNG from downstream image generation (optional until generated). */
  imageB64?: string;
}

export type StimulusAsset =
  | TableStimulus
  | LineGraphStimulus
  | BarChartStimulus
  | DiagramStimulus
  | ScenarioStimulus
  | IllustrationStimulus;

export interface ShortAnswerPart {
  label: PartLabel;
  prompt: string;
  taskType: TaskType;
  /** Integer >= 1. Total item points are the sum of part maxScores. */
  maxScore: number;
  /** Structured part-level rubric used for grading and feedback. */
  rubric: PartRubric;
  /** Legacy part rubric text retained for older saved items. */
  scoringGuidance: string;
  /** Character limit for the answer textarea. */
  maxLength: number;
}

export interface PartRubric {
  pointsPossible: number;
  /** Criteria text for each score level "0".."N" for this part. */
  criteria: Record<string, string>;
}

export interface HolisticRubric {
  pointsPossible: number;
  /** Criteria text for each score level "0".."N". */
  criteria: Record<string, string>;
}

export interface AnnotatedResponse {
  score: number;
  /** Full response text; for multi-part items typically per-part keyed prose. */
  response: string;
  annotation: string;
}

export interface KeyTerm {
  term: string;
  definition: string;
}

export interface BlueprintTaskPart {
  kcCode: string;
  taskType: TaskType;
  function: string;
}

export interface ItemBlueprint {
  targetStandard: string;
  anchorKc: string;
  coreKc: string;
  selectedKcs: string[];
  supportingKcs: string[];
  stemAffordance: string;
  compatibilityRationale: string;
  cognitiveDemand: string;
  keyConcepts: string[];
  taskSequence: Partial<Record<PartLabel, BlueprintTaskPart>>;
  stimulusType: StimulusType;
  evidencePattern: string;
  expectedResponseElements: string[];
  commonIncompleteResponses: string[];
}

export interface GroundingSummary {
  studyGuide: { empty: boolean; chunkIds: string[] };
  rubric: { empty: boolean; items: string[] };
  cards: { empty: boolean; cardIds: string[] };
}

export interface GenerationMetadata {
  method: "method2_blueprint_rag_l2";
  useBlueprint: true;
  useStudyGuideRag: true;
  telerLevel: 2;
  modelId: string;
  temperature: number;
  grounding: GroundingSummary;
  generatedAt: string;
}

export interface ShortAnswerItem {
  stem: string;
  stimulus: StimulusAsset;
  parts: ShortAnswerPart[];
  /** Legacy holistic rubric retained only for older saved items. New items omit it. */
  scoringRubric?: HolisticRubric;
  keyTerms: KeyTerm[];
  annotatedResponses: AnnotatedResponse[];
  blueprint: ItemBlueprint;
  generation: GenerationMetadata;
}

// ---------------------------------------------------------------------------
// Grading / feedback shapes
// ---------------------------------------------------------------------------

export type GradingMethod = "1" | "2" | "3";

export type FeedbackVerdict =
  | "correct"
  | "good_try"
  | "good_start"
  | "heres_the_idea"
  | "no_response";

export interface FeedbackSegment {
  /** Small uppercase label, e.g. "What I noticed", "Try this". */
  label: string;
  text: string;
}

export interface GradedFeedback {
  verdict: FeedbackVerdict;
  segments: FeedbackSegment[];
  /** Plain-text model answer; present only on a resolving incorrect final attempt. */
  modelAnswer?: string;
  /** Key vocabulary terms shown as glossary chips. */
  glossaryTerms?: string[];
}

export type GradingConfidence = "high" | "medium" | "low";

export interface GradingModelConfig {
  method: GradingMethod;
  modelId: string;
  temperature: number;
}

export interface PartGradingResult {
  score: number;
  maxScore: number;
  correct: boolean;
  feedback: GradedFeedback;
  diagnosedGap?: string;
  confidence?: GradingConfidence;
  tokenCount?: number;
  latencyMs?: number;
}
