import type { Question } from "@/types/question";
import type { DOKLevel } from "@/types/question";
import type { ShortAnswerItem, StimulusType } from "@/types/short-answer";
import {
  getStandardById,
  getModuleNumberForStandard,
  getTopicForStandard,
} from "@/lib/standards";

export const STIMULUS_TYPES: StimulusType[] = [
  "table",
  "line_graph",
  "bar_chart",
  "diagram",
  "scenario",
  "illustration",
];

/** Randomly choose a stimulus type; MCQs may also be text-only. */
export function pickRandomStimulusType(
  includeTextOnly: boolean,
): StimulusType | undefined {
  const choices: Array<StimulusType | undefined> = [
    ...(includeTextOnly ? [undefined] : []),
    ...STIMULUS_TYPES,
  ];
  return choices[Math.floor(Math.random() * choices.length)];
}

export function buildShortAnswerQuestion(
  item: ShortAnswerItem,
  standardId: string,
  id: string,
): Question {
  const standard = getStandardById(standardId);
  return {
    id,
    module: getModuleNumberForStandard(standardId),
    topic: getTopicForStandard(standardId),
    standardId,
    standardLabel: standard?.label,
    text: item.parts[0]?.prompt ?? item.stem,
    imageUrl: null,
    options: [],
    correctOptionId: "",
    questionType: "open-ended",
    shortAnswer: item,
    kcCode: item.blueprint.anchorKc,
    source: "generated",
    includeInSelfPractice: true,
  };
}

export type GeneratedItemResult =
  | { ok: true; questions: Question[]; modelId?: string; modelLabel?: string }
  | { ok: false; error: string };

export interface GenerateMcqItemParams {
  standardId: string;
  setName: string;
  kcCode?: string;
  modelId: string;
  temperature: number;
  stimulusType?: StimulusType;
  dokLevels?: DOKLevel[];
  customPrompt?: string;
}

/** Generate one MCQ for a standard (optionally pinned to a specific KC). */
export async function generateMcqItem(
  params: GenerateMcqItemParams,
): Promise<GeneratedItemResult> {
  const standard = getStandardById(params.standardId);
  const payload = {
    questionSetName: params.setName,
    questionCount: 1,
    topics: [
      standard
        ? `Module ${standard.module} - ${standard.category}`
        : params.standardId,
    ],
    standards: [params.standardId],
    standardCounts: { [params.standardId]: 1 },
    dokLevels: params.dokLevels ?? ([1, 2, 3] as DOKLevel[]),
    includeDiagrams: params.stimulusType !== undefined,
    stimulusType: params.stimulusType,
    customPrompt: params.customPrompt ?? "",
    generationModelId: params.modelId,
    generationTemperature: params.temperature,
    fixedCoreKC: params.kcCode,
  };

  try {
    const response = await fetch("/api/generate-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: data.error ?? String(response.status) };
    }
    const data = (await response.json()) as {
      questions: Question[];
      generationModelId?: string;
      generationModelLabel?: string;
    };
    return {
      ok: true,
      questions: data.questions,
      modelId: data.generationModelId,
      modelLabel: data.generationModelLabel,
    };
  } catch {
    return { ok: false, error: "network error" };
  }
}

export interface GenerateSaqItemParams {
  standardId: string;
  /** Identity for the built question row. */
  questionId: string;
  kcCode?: string;
  modelId: string;
  temperature: number;
  stimulusType?: StimulusType;
}

/** Generate one short-answer item for a standard (optionally pinned to a KC). */
export async function generateSaqItem(
  params: GenerateSaqItemParams,
): Promise<GeneratedItemResult> {
  try {
    const response = await fetch("/api/short-answer/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        standardCode: params.standardId,
        fixedCoreKC: params.kcCode,
        stimulusType: params.stimulusType,
        modelId: params.modelId,
        temperature: params.temperature,
      }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        stage?: string;
      };
      const detail =
        data.stage != null
          ? `${data.error ?? response.status} (stage: ${data.stage})`
          : (data.error ?? String(response.status));
      return { ok: false, error: detail };
    }
    const { item } = (await response.json()) as { item: ShortAnswerItem };
    return {
      ok: true,
      questions: [buildShortAnswerQuestion(item, params.standardId, params.questionId)],
    };
  } catch {
    return { ok: false, error: "network error" };
  }
}

/**
 * Run async tasks with a bounded worker pool. Results keep task order.
 * `onSettled` fires after each task completes (success or failure).
 */
export async function runWithConcurrency<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  limit: number,
  onSettled?: (completedCount: number) => void,
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;
  let completed = 0;
  const workerCount = Math.max(1, Math.min(limit, tasks.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (next < tasks.length) {
        const index = next;
        next += 1;
        results[index] = await tasks[index]();
        completed += 1;
        onSettled?.(completed);
      }
    }),
  );
  return results;
}
