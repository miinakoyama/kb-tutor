"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { assertSetNameUniqueForSchools } from "@/lib/generated-set-naming";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Loader2,
} from "lucide-react";
import type { DOKLevel, Question } from "@/types/question";
import type { ShortAnswerItem, StimulusType } from "@/types/short-answer";
import {
  getAllStandards,
  getStandardById,
  getStandardsByFilter,
  getStandardsForModule,
  getModuleNumberForStandard,
  getTopicForStandard,
  type ModuleCode,
} from "@/lib/standards";
import {
  GENERATION_MODELS,
  DEFAULT_GENERATION_MODEL_ID,
  DEFAULT_GENERATION_TEMPERATURE,
} from "@/lib/llm/models";

const ALL_STANDARDS = getAllStandards();
const ALL_STANDARD_IDS = new Set(ALL_STANDARDS.map((item) => item.id));
const MODULE_ORDER: ModuleCode[] = ["A", "B"];

interface TopicSelection {
  key: string;
  label: string;
  module: ModuleCode;
  category: string;
}

const TOPIC_SELECTIONS: TopicSelection[] = MODULE_ORDER.flatMap((module) => {
  const categories = Array.from(
    new Set(getStandardsForModule(module).map((standard) => standard.category))
  );
  return categories.map((category) => ({
    key: `Module ${module} - ${category}`,
    label: `Module ${module} - ${category}`,
    module,
    category,
  }));
});

const TOPIC_SELECTION_BY_KEY = new Map(
  TOPIC_SELECTIONS.map((selection) => [selection.key, selection])
);

type StimulusConfig = Record<StimulusType, number>;
type StimulusSelectionMode = "auto" | "custom";

interface GenerationSettings {
  questionSetName: string;
  questionCount: number;
  topics: string[];
  standards: string[];
  standardCounts: Record<string, number>;
  dokLevels: DOKLevel[];
  stimulusSelectionMode: StimulusSelectionMode;
  stimulusConfig: StimulusConfig;
  customPrompt: string;
  shortAnswerCount: number;
  generationModelId: string;
  generationTemperature: number;
}

function distributeStandardCounts(
  standardIds: string[],
  questionCount: number
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (standardIds.length === 0 || questionCount <= 0) return counts;

  const base = Math.floor(questionCount / standardIds.length);
  let remainder = questionCount % standardIds.length;
  for (const standardId of standardIds) {
    counts[standardId] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
  }
  return counts;
}

/** Split per-standard totals into MCQ and short-answer portions (largest-remainder). */
function splitStandardCountsByType(
  activeStandardIds: string[],
  standardCounts: Record<string, number>,
  mcqTotal: number,
  saqTotal: number,
): { mcqCounts: Record<string, number>; saqCounts: Record<string, number> } {
  const zeroed = Object.fromEntries(activeStandardIds.map((id) => [id, 0]));
  if (activeStandardIds.length === 0) {
    return { mcqCounts: zeroed, saqCounts: zeroed };
  }

  const allocateWithinStandardTotals = (total: number): Record<string, number> => {
    if (total <= 0) return { ...zeroed };

    const weights = activeStandardIds.map((id) => ({
      id,
      weight: standardCounts[id] ?? 0,
    }));
    const weightSum = weights.reduce((sum, row) => sum + row.weight, 0);

    if (weightSum <= 0) {
      return distributeStandardCounts(activeStandardIds, total);
    }

    const fractions = weights.map((row) => {
      const exact = (total * row.weight) / weightSum;
      const cap = Math.max(0, Math.floor(row.weight));
      return { id: row.id, exact, cap, count: Math.min(cap, Math.floor(exact)) };
    });
    const result = Object.fromEntries(
      fractions.map((row) => [row.id, row.count]),
    );
    let remainder = total - fractions.reduce((sum, row) => sum + row.count, 0);
    const byRemainder = [...fractions].sort(
      (a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)),
    );
    for (const row of byRemainder) {
      if (remainder <= 0) break;
      if (result[row.id] >= row.cap) continue;
      result[row.id] += 1;
      remainder -= 1;
    }
    return result;
  };

  if (mcqTotal <= saqTotal) {
    const mcqCounts = allocateWithinStandardTotals(mcqTotal);
    const saqCounts = Object.fromEntries(
      activeStandardIds.map((id) => [
        id,
        Math.max(0, (standardCounts[id] ?? 0) - (mcqCounts[id] ?? 0)),
      ]),
    );
    return { mcqCounts, saqCounts };
  }

  const saqCounts = allocateWithinStandardTotals(saqTotal);
  const mcqCounts = Object.fromEntries(
    activeStandardIds.map((id) => [
      id,
      Math.max(0, (standardCounts[id] ?? 0) - (saqCounts[id] ?? 0)),
    ]),
  );
  return { mcqCounts, saqCounts };
}

const DEFAULT_SETTINGS: GenerationSettings = {
  questionSetName: "",
  questionCount: 5,
  topics: TOPIC_SELECTIONS.map((selection) => selection.key),
  standards: ALL_STANDARDS.map((item) => item.id),
  standardCounts: distributeStandardCounts(
    ALL_STANDARDS.map((item) => item.id),
    5
  ),
  dokLevels: [1, 2, 3],
  stimulusSelectionMode: "auto",
  stimulusConfig: {
    table: 0,
    line_graph: 0,
    bar_chart: 0,
    diagram: 0,
    scenario: 0,
    illustration: 0,
  },
  customPrompt: "",
  shortAnswerCount: 0,
  generationModelId: DEFAULT_GENERATION_MODEL_ID,
  generationTemperature: DEFAULT_GENERATION_TEMPERATURE,
};

/** Expand per-standard counts into a flat list of standard codes (one per item). */
function expandStandardCounts(counts: Record<string, number>): string[] {
  const codes: string[] = [];
  for (const [standardId, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i++) codes.push(standardId);
  }
  return codes;
}

const STIMULUS_LABELS: Record<StimulusType, string> = {
  table: "Data table",
  line_graph: "Line graph",
  bar_chart: "Bar chart",
  diagram: "Diagram",
  scenario: "Scenario text",
  illustration: "Illustration",
};

function stimulusConfigTotal(config: StimulusConfig): number {
  return Object.values(config).reduce((sum, count) => sum + count, 0);
}

function normalizeCount(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function readStimulusConfig(raw: Record<string, unknown>): StimulusConfig {
  const stimulusRaw =
    raw.stimulusConfig && typeof raw.stimulusConfig === "object"
      ? (raw.stimulusConfig as Record<string, unknown>)
      : null;
  if (stimulusRaw) {
    return {
      table: normalizeCount(stimulusRaw.table),
      line_graph: normalizeCount(stimulusRaw.line_graph),
      bar_chart: normalizeCount(stimulusRaw.bar_chart),
      diagram: normalizeCount(stimulusRaw.diagram),
      scenario: normalizeCount(stimulusRaw.scenario),
      illustration: normalizeCount(stimulusRaw.illustration),
    };
  }

  const legacyRaw =
    raw.diagramConfig && typeof raw.diagramConfig === "object"
      ? (raw.diagramConfig as Record<string, unknown>)
      : {};
  const chart = normalizeCount(legacyRaw.chart);
  return {
    table: normalizeCount(legacyRaw.table),
    line_graph: Math.ceil(chart / 2),
    bar_chart: Math.floor(chart / 2),
    diagram:
      normalizeCount(legacyRaw.diagram) + normalizeCount(legacyRaw.flowchart),
    scenario: 0,
    illustration: 0,
  };
}

function takeStimulusCount(
  remaining: StimulusConfig,
  key: StimulusType,
  capacity: number,
): number {
  const count = Math.min(remaining[key], capacity);
  remaining[key] -= count;
  return count;
}

function splitStimulusConfig(
  config: StimulusConfig,
  mcqCapacity: number,
): { mcqStimulusConfig: StimulusConfig; saqStimulusConfig: StimulusConfig } {
  const remaining = { ...config };
  let capacity = Math.max(0, mcqCapacity);
  const mcqStimulusConfig: StimulusConfig = {
    table: 0,
    line_graph: 0,
    bar_chart: 0,
    diagram: 0,
    scenario: 0,
    illustration: 0,
  };

  for (const key of Object.keys(mcqStimulusConfig) as StimulusType[]) {
    mcqStimulusConfig[key] = takeStimulusCount(remaining, key, capacity);
    capacity -= mcqStimulusConfig[key];
  }

  return {
    mcqStimulusConfig,
    saqStimulusConfig: remaining,
  };
}

function expandStimulusTypes(config: StimulusConfig, total: number): Array<StimulusType | undefined> {
  const stimulusTypes: Array<StimulusType | undefined> = [];
  for (const key of Object.keys(config) as StimulusType[]) {
    for (let i = 0; i < config[key]; i++) stimulusTypes.push(key);
  }
  while (stimulusTypes.length < total) stimulusTypes.push(undefined);
  return stimulusTypes.slice(0, total);
}

/** Randomly choose a stimulus type (or text-only) for every generated item. */
function createRandomStimulusTypes(
  total: number,
  includeTextOnly: boolean,
): Array<StimulusType | undefined> {
  const choices: Array<StimulusType | undefined> = [
    ...(includeTextOnly ? [undefined] : []),
    ...(Object.keys(STIMULUS_LABELS) as StimulusType[]),
  ];
  return Array.from(
    { length: total },
    () => choices[Math.floor(Math.random() * choices.length)],
  );
}

function buildShortAnswerQuestion(
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

const STORAGE_KEY = "massProductionSettings";

type SchoolOption = { id: string; name: string };

export default function MassProductionPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<GenerationSettings>(DEFAULT_SETTINGS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedTopics, setExpandedTopics] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [schoolOptions, setSchoolOptions] = useState<SchoolOption[]>([]);
  const [selectedSchoolIds, setSelectedSchoolIds] = useState<string[]>([]);

  useEffect(() => {
    async function loadSchools() {
      try {
        const res = await fetch("/api/teacher/schools");
        if (!res.ok) return;
        const data = (await res.json()) as { schools: SchoolOption[] };
        setSchoolOptions(data.schools ?? []);
      } catch {
        // ignore
      }
    }
    void loadSchools();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("schoolIds");
    if (raw) {
      const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length > 0) setSelectedSchoolIds(ids);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const legacy = parsed as Record<string, unknown>;
        const merged: GenerationSettings = {
          ...DEFAULT_SETTINGS,
          ...parsed,
          generationModelId:
            typeof legacy.generationModelId === "string"
              ? legacy.generationModelId
              : typeof legacy.saModelId === "string"
                ? legacy.saModelId
                : DEFAULT_SETTINGS.generationModelId,
          generationTemperature:
            typeof legacy.generationTemperature === "number"
              ? legacy.generationTemperature
              : typeof legacy.saTemperature === "number"
                ? legacy.saTemperature
                : DEFAULT_SETTINGS.generationTemperature,
          stimulusConfig: readStimulusConfig(legacy),
          stimulusSelectionMode:
            legacy.stimulusSelectionMode === "auto" ||
            legacy.stimulusSelectionMode === "custom"
              ? legacy.stimulusSelectionMode
              : "custom",
        };

        const normalizedTopics = Array.isArray(merged.topics)
          ? merged.topics.filter((topic): topic is string =>
              TOPIC_SELECTION_BY_KEY.has(topic)
            )
          : [];

        const normalizedStandards = Array.isArray(merged.standards)
          ? merged.standards.filter(
              (standardId): standardId is string =>
                ALL_STANDARD_IDS.has(standardId)
            )
          : [];
        const selectedStandards =
          normalizedStandards.length > 0
            ? normalizedStandards
            : DEFAULT_SETTINGS.standards;
        const rawCounts =
          merged.standardCounts && typeof merged.standardCounts === "object"
            ? (merged.standardCounts as Record<string, unknown>)
            : {};
        const normalizedStandardCounts: Record<string, number> = {};
        for (const standardId of selectedStandards) {
          const value = rawCounts[standardId];
          normalizedStandardCounts[standardId] =
            typeof value === "number" && Number.isInteger(value) && value >= 0
              ? value
              : 0;
        }
        const assignedTotal = Object.values(normalizedStandardCounts).reduce(
          (sum, count) => sum + count,
          0
        );
        const totalTarget =
          (typeof merged.questionCount === "number" ? merged.questionCount : 0) +
          (typeof merged.shortAnswerCount === "number" ? merged.shortAnswerCount : 0);
        const resolvedStandardCounts =
          assignedTotal === totalTarget
            ? normalizedStandardCounts
            : distributeStandardCounts(selectedStandards, totalTarget);

        setSettings({
          ...merged,
          topics:
            normalizedTopics.length > 0
              ? normalizedTopics
              : DEFAULT_SETTINGS.topics,
          standards: selectedStandards,
          standardCounts: resolvedStandardCounts,
        });
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isGenerating) {
      setElapsedTime(0);
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  const totalStimulusCount = stimulusConfigTotal(settings.stimulusConfig);
  const totalQuestionTarget = settings.questionCount + settings.shortAnswerCount;
  const totalAssignedStandardCount = ALL_STANDARDS.reduce(
    (sum, standard) => sum + (settings.standardCounts[standard.id] ?? 0),
    0
  );
  const isStandardCountValid =
    totalQuestionTarget === 0
      ? totalAssignedStandardCount === 0
      : totalAssignedStandardCount === totalQuestionTarget;
  const activeStandardIds = ALL_STANDARDS
    .map((standard) => standard.id)
    .filter((standardId) => (settings.standardCounts[standardId] ?? 0) > 0);

  const { mcqCounts, saqCounts } = splitStandardCountsByType(
    activeStandardIds,
    settings.standardCounts,
    settings.questionCount,
    settings.shortAnswerCount,
  );

  const textOnlyCount = Math.max(0, totalQuestionTarget - totalStimulusCount);

  const getStandardsForSelection = (selectionKey: string) => {
    const selection = TOPIC_SELECTION_BY_KEY.get(selectionKey);
    if (!selection) return [];
    return getStandardsByFilter({
      module: selection.module,
      category: selection.category,
    });
  };

  const handleAutoDistributeCounts = () => {
    setSettings((prev) => ({
      ...prev,
      standardCounts: distributeStandardCounts(
        ALL_STANDARDS.map((item) => item.id),
        prev.questionCount + prev.shortAnswerCount,
      ),
    }));
  };

  const handleClearAllCounts = () => {
    setSettings((prev) => ({
      ...prev,
      standardCounts: Object.fromEntries(
        ALL_STANDARDS.map((item) => [item.id, 0])
      ),
    }));
  };

  const handleDokToggle = (level: DOKLevel) => {
    setSettings((prev) => ({
      ...prev,
      dokLevels: prev.dokLevels.includes(level)
        ? prev.dokLevels.filter((l) => l !== level)
        : [...prev.dokLevels, level].sort(),
    }));
  };

  const toggleTopicExpansion = (selectionKey: string) => {
    setExpandedTopics((prev) =>
      prev.includes(selectionKey)
        ? prev.filter((item) => item !== selectionKey)
        : [...prev, selectionKey]
    );
  };

  const handleStandardCountChange = (standardId: string, rawValue: string) => {
    const value = rawValue === "" ? 0 : parseInt(rawValue, 10);
    if (isNaN(value)) return;
    setSettings((prev) => {
      const maxCount = prev.questionCount + prev.shortAnswerCount;
      return {
        ...prev,
        standardCounts: {
          ...prev.standardCounts,
          [standardId]: Math.max(0, Math.min(value, maxCount)),
        },
      };
    });
  };

  const handleAutoDistributeDiagrams = () => {
    const diagramTypes: StimulusType[] = ["table", "line_graph", "bar_chart", "diagram"];

    setSettings((prev) => {
      const total = prev.questionCount + prev.shortAnswerCount;
      const base = Math.floor(total / diagramTypes.length);
      let remainder = total % diagramTypes.length;
      const nextStimulusConfig: StimulusConfig = {
        ...prev.stimulusConfig,
        table: 0,
        line_graph: 0,
        bar_chart: 0,
        diagram: 0,
        scenario: 0,
        illustration: 0,
      };

      for (const type of diagramTypes) {
        nextStimulusConfig[type] = base + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder -= 1;
      }

      return { ...prev, stimulusConfig: nextStimulusConfig };
    });
  };

  const handleStimulusCountChange = (type: StimulusType, rawValue: string) => {
    const value = rawValue === "" ? 0 : parseInt(rawValue, 10);
    if (isNaN(value)) return;
    setSettings((prev) => ({
      ...prev,
      stimulusConfig: {
        ...prev.stimulusConfig,
        [type]: Math.max(0, Math.min(value, prev.questionCount + prev.shortAnswerCount)),
      },
    }));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleGenerate = async () => {
    const trimmedSetName = settings.questionSetName.trim();
    const wantMcq = settings.questionCount > 0;
    const wantShortAnswer = settings.shortAnswerCount > 0;

    if (!trimmedSetName) {
      setError("Please enter a question set name.");
      return;
    }
    if (!wantMcq && !wantShortAnswer) {
      setError("Set an MCQ count or a short-answer count greater than 0.");
      return;
    }
    if (wantMcq) {
      if (settings.dokLevels.length === 0) {
        setError("Please select at least one DOK level.");
        return;
      }
    }
    if (
      settings.stimulusSelectionMode === "custom" &&
      totalStimulusCount > totalQuestionTarget
    ) {
      setError("Total stimulus count cannot exceed MCQ count + short-answer count.");
      return;
    }
    if (totalQuestionTarget > 0) {
      if (activeStandardIds.length === 0) {
        setError("Please set count > 0 for at least one standard.");
        return;
      }
      if (!isStandardCountValid) {
        setError(
          `Standard counts must sum to ${totalQuestionTarget} (MCQ ${settings.questionCount} + short-answer ${settings.shortAnswerCount}). Current total: ${totalAssignedStandardCount}.`,
        );
        return;
      }
    }
    if (selectedSchoolIds.length === 0) {
      setError("Select at least one school to attach this question set.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const dup = await assertSetNameUniqueForSchools(
      supabase,
      trimmedSetName,
      selectedSchoolIds,
    );
    if (!dup.ok) {
      setError(dup.message);
      return;
    }

    setError(null);
    setWarnings([]);
    setProgress(null);
    setIsGenerating(true);

    try {
      const generatedAt = new Date().toISOString();
      const mergedQuestions: Question[] = [];
      let generationModel: { id?: string; label?: string } | undefined;
      const runWarnings: string[] = [];
      const { mcqStimulusConfig, saqStimulusConfig } = splitStimulusConfig(
        settings.stimulusSelectionMode === "custom"
          ? settings.stimulusConfig
          : DEFAULT_SETTINGS.stimulusConfig,
        settings.questionCount,
      );

      // ── MCQ generation (one HTTP call per item) ─────────────────────────
      if (wantMcq) {
        const codes = expandStandardCounts(mcqCounts);
        const stimulusTypes =
          settings.stimulusSelectionMode === "auto"
            ? createRandomStimulusTypes(codes.length, true)
            : expandStimulusTypes(
                mcqStimulusConfig,
                codes.length,
              );
        let succeeded = 0;

        for (let i = 0; i < codes.length; i++) {
          setProgress(`Generating multiple-choice question ${i + 1} of ${codes.length}...`);
          const standardId = codes[i];
          const payload = {
            ...settings,
            topics: TOPIC_SELECTIONS.filter((selection) =>
              getStandardsForSelection(selection.key).some(
                (standard) => standard.id === standardId,
              ),
            ).map((selection) => selection.key),
            standards: [standardId],
            questionSetName: trimmedSetName,
            questionCount: 1,
            generationModelId: settings.generationModelId,
            generationTemperature: settings.generationTemperature,
            includeDiagrams: stimulusTypes[i] !== undefined,
            stimulusType: stimulusTypes[i],
            standardCounts: { [standardId]: 1 },
          };

          const response = await fetch("/api/generate-questions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            const data = (await response.json().catch(() => ({}))) as {
              error?: string;
            };
            runWarnings.push(
              `MCQ item ${i + 1} (${standardId}) failed: ${data.error ?? response.status}`,
            );
            continue;
          }
          const data = await response.json();
          mergedQuestions.push(...(data.questions as Question[]));
          generationModel = {
            id: data.generationModelId,
            label: data.generationModelLabel,
          };
          succeeded += 1;
        }

        if (succeeded === 0 && settings.questionCount > 0) {
          setWarnings(runWarnings);
          throw new Error("No multiple-choice questions were generated.");
        }
      }

      // ── Short-answer generation (one HTTP call per item) ────────────────
      if (wantShortAnswer) {
        const codes = expandStandardCounts(saqCounts);
        const stimulusTypes =
          settings.stimulusSelectionMode === "auto"
            ? createRandomStimulusTypes(codes.length, false)
            : expandStimulusTypes(
                saqStimulusConfig,
                codes.length,
              );
        let succeeded = 0;
        for (let i = 0; i < codes.length; i++) {
          setProgress(
            `Generating short-answer item ${i + 1} of ${codes.length}...`,
          );
          try {
            const res = await fetch("/api/short-answer/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                standardCode: codes[i],
                stimulusType: stimulusTypes[i],
                modelId: settings.generationModelId,
                temperature: settings.generationTemperature,
              }),
            });
            if (!res.ok) {
              const data = (await res.json().catch(() => ({}))) as {
                error?: string;
                stage?: string;
              };
              const detail =
                data.stage != null
                  ? `${data.error ?? res.status} (stage: ${data.stage})`
                  : (data.error ?? String(res.status));
              runWarnings.push(
                `Short-answer item ${i + 1} (${codes[i]}) failed: ${detail}`,
              );
              continue;
            }
            const { item } = (await res.json()) as { item: ShortAnswerItem };
            mergedQuestions.push(
              buildShortAnswerQuestion(
                item,
                codes[i],
                `sa-${generatedAt}-${i}`,
              ),
            );
            succeeded += 1;
          } catch {
            runWarnings.push(
              `Short-answer item ${i + 1} (${codes[i]}) failed: network error`,
            );
          }
        }
        if (!generationModel && succeeded > 0) {
          const model = GENERATION_MODELS.find((m) => m.id === settings.generationModelId);
          generationModel = { id: model?.id, label: model?.label };
        }
      }

      if (mergedQuestions.length === 0) {
        setWarnings(runWarnings);
        throw new Error(
          "No questions were generated. See the details below and try again.",
        );
      }

      setProgress("Saving question set...");
      const { addGeneratedQuestionSet } = await import("@/lib/question-storage");
      const setId = await addGeneratedQuestionSet(
        mergedQuestions,
        trimmedSetName,
        generatedAt,
        {
          generationModel,
          schoolLinks: selectedSchoolIds.map((schoolId) => ({ schoolId })),
        },
      );

      router.push(`/content/questions/${encodeURIComponent(setId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setProgress(null);
      setIsGenerating(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-10 sm:px-6 sm:py-12 lg:px-10 lg:py-14 xl:px-12">
      <Link
        href="/content"
        className="inline-flex items-center gap-2 text-base font-semibold text-heading hover:text-forest transition-colors mb-6"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--assignment-calendar-nav-bg)]">
          <ArrowLeft className="w-4 h-4 text-heading" />
        </span>
        Back to Content Management
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="w-6 h-6 text-[var(--assignment-completed)]" />
        <div>
          <h1 className="font-heading text-xl font-bold text-slate-gray tracking-[-0.4px]">
            LLM Mass Production
          </h1>
          <p className="text-sm text-muted-foreground">
            Generate questions at scale using AI
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Question Set Name */}
        <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] p-6 shadow-[var(--assignment-card-shadow)]">
          <h2 className="text-lg font-medium text-slate-gray mb-4">
            Question Set
          </h2>
          <div>
            <label className="block text-sm font-medium text-slate-gray mb-2">
              Name *
            </label>
            <input
              type="text"
              value={settings.questionSetName}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  questionSetName: e.target.value,
                }))
              }
              placeholder="e.g., Photosynthesis Practice Set"
              className="w-full max-w-md rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Required: this name is used to identify the generated set later.
              It must be unique among sets linked to each selected school.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] p-6 shadow-[var(--assignment-card-shadow)]">
          <h2 className="text-lg font-medium text-slate-gray mb-4">
            Schools *
          </h2>
          <p className="text-sm text-muted-foreground mb-3">
            Choose which school catalogs receive this set. You can enable Self
            Practice later in Question Manager.
          </p>
          {schoolOptions.length === 0 ? (
            <p className="text-sm text-amber-700">
              No schools found. Ensure your account is a teacher or admin with
              access to schools.
            </p>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {schoolOptions.map((school) => (
                <li key={school.id}>
                  <label className="flex items-center gap-2 text-sm text-slate-gray cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSchoolIds.includes(school.id)}
                      onChange={() => {
                        setSelectedSchoolIds((prev) =>
                          prev.includes(school.id)
                            ? prev.filter((id) => id !== school.id)
                            : [...prev, school.id],
                        );
                      }}
                      className="rounded border-border-default accent-[var(--assignment-completed)]"
                    />
                    {school.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Basic Settings */}
        <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] p-6 shadow-[var(--assignment-card-shadow)]">
          <h2 className="text-lg font-medium text-slate-gray mb-4">
            Basic Settings
          </h2>

          {/* Question Counts (MCQ + short-answer) */}
          <div className="mb-6 flex flex-wrap gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-gray mb-2">
                MCQ Count
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={settings.questionCount || ""}
                onChange={(e) => {
                  const rawValue = e.target.value;
                  if (rawValue === "") {
                    setSettings((prev) => ({ ...prev, questionCount: 0 }));
                    return;
                  }
                  const value = parseInt(rawValue, 10);
                  if (!isNaN(value)) {
                    const nextCount = Math.max(0, Math.min(20, value));
                    setSettings((prev) => ({
                      ...prev,
                      questionCount: nextCount,
                    }));
                  }
                }}
                placeholder="5"
                className="w-24 rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 text-center"
              />
              <p className="text-xs text-muted-foreground mt-1">
                0-20 multiple-choice questions
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-gray mb-2">
                Short-answer Count
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={settings.shortAnswerCount || ""}
                onChange={(e) => {
                  const rawValue = e.target.value;
                  if (rawValue === "") {
                    setSettings((prev) => ({ ...prev, shortAnswerCount: 0 }));
                    return;
                  }
                  const value = parseInt(rawValue, 10);
                  if (!isNaN(value)) {
                    setSettings((prev) => ({
                      ...prev,
                      shortAnswerCount: Math.max(0, Math.min(20, value)),
                    }));
                  }
                }}
                placeholder="0"
                className="w-24 rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 text-center"
              />
              <p className="text-xs text-muted-foreground mt-1">
                0-20 constructed-response items
              </p>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-gray mb-2">
                Generation Model
              </label>
              <select
                value={settings.generationModelId}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    generationModelId: e.target.value,
                  }))
                }
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm"
              >
                {GENERATION_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Used for both multiple-choice and short-answer generation.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-gray mb-2">
                Temperature
              </label>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={settings.generationTemperature}
                onChange={(e) => {
                  const value = parseFloat(e.target.value);
                  setSettings((prev) => ({
                    ...prev,
                    generationTemperature: Number.isNaN(value)
                      ? DEFAULT_GENERATION_TEMPERATURE
                      : Math.max(0, Math.min(2, value)),
                  }));
                }}
                className="w-28 rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm text-center"
              />
            </div>
          </div>

          {/* Topic and Standard Selection */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-gray">
                Topics & Standards (count-driven)
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleAutoDistributeCounts}
                  className="text-xs text-[var(--assignment-completed)] hover:brightness-110 font-medium"
                >
                  Auto distribute
                </button>
                <button
                  onClick={handleClearAllCounts}
                  className="text-xs text-[var(--assignment-completed)] hover:brightness-110 font-medium"
                >
                  Clear all counts
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {TOPIC_SELECTIONS.map((selection) => {
                const topicStandards = getStandardsForSelection(selection.key);
                const selectedCount = topicStandards.filter((item) =>
                  (settings.standardCounts[item.id] ?? 0) > 0
                ).length;
                const isExpanded = expandedTopics.includes(selection.key);
                const hasStandards = topicStandards.length > 0;

                return (
                  <div
                    key={selection.key}
                    className="rounded-lg border border-border-default overflow-hidden"
                  >
                    <div className="flex items-center justify-between gap-2 p-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {hasStandards && (
                          <button
                            type="button"
                            onClick={() => toggleTopicExpansion(selection.key)}
                            className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-surface-muted text-muted-foreground hover:text-foreground"
                            aria-label={
                              isExpanded ? "Hide standards" : "Show standards"
                            }
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <span className="text-sm text-slate-gray truncate">
                          {selection.label}
                        </span>
                        {hasStandards && (
                          <span className="text-xs text-muted-foreground">
                            ({selectedCount}/{topicStandards.length})
                          </span>
                        )}
                      </div>
                    </div>

                    {isExpanded && hasStandards && (
                      <div className="border-t border-border-default bg-surface-muted/70 px-3 py-2 space-y-1.5">
                        {topicStandards.map((standard) => (
                          <div
                            key={`${selection.key}-${standard.id}`}
                            className="flex items-start gap-3 p-1.5 rounded hover:bg-surface"
                          >
                            <div className="flex-1 min-w-0 text-sm text-slate-gray">
                              <span className="font-medium">{standard.id}</span> -{" "}
                              {standard.label}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-xs text-muted-foreground">Count</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={settings.standardCounts[standard.id] ?? 0}
                                onChange={(event) =>
                                  handleStandardCountChange(
                                    standard.id,
                                    event.target.value
                                  )
                                }
                                className="w-14 px-2 py-1 border border-border-default rounded-md text-center text-xs"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                isStandardCountValid
                  ? "border-[var(--assignment-completed)] bg-[var(--assignment-calendar-nav-bg)] text-heading"
                  : "border-error-border bg-error-light text-error"
              }`}
            >
              <span className="font-medium">
                Total standard counts: {totalAssignedStandardCount} /{" "}
                {totalQuestionTarget} questions
              </span>
              {totalQuestionTarget > 0 && (
                <span className="block text-xs mt-0.5 opacity-80">
                  MCQ {settings.questionCount} + short-answer{" "}
                  {settings.shortAnswerCount}
                </span>
              )}
              {!isStandardCountValid && (
                <span className="block text-xs mt-1">
                  Adjust counts so the total matches MCQ count + short-answer
                  count.
                </span>
              )}
            </div>
          </div>

          {/* DOK Level Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-gray mb-2">
              DOK Levels (Depth of Knowledge)
            </label>
            <div className="space-y-2">
              {([1, 2, 3] as DOKLevel[]).map((level) => (
                <label
                  key={level}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-foreground/5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={settings.dokLevels.includes(level)}
                    onChange={() => handleDokToggle(level)}
                    className="w-4 h-4 mt-0.5 rounded border-border-default accent-[var(--assignment-completed)]"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-gray">
                      DOK {level} -{" "}
                      {level === 1
                        ? "Recall"
                        : level === 2
                        ? "Skill/Concept"
                        : "Strategic Thinking"}
                    </span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {level === 1
                        ? "Recall facts, definitions, terms"
                        : level === 2
                        ? "Apply concepts, compare, interpret"
                        : "Analyze, evaluate, draw conclusions"}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

        </section>

        {/* Stimulus Settings */}
        <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] p-6 shadow-[var(--assignment-card-shadow)]">
          <h2 className="text-lg font-medium text-slate-gray mb-4">
            Stimulus Settings
          </h2>

          <div className="space-y-4">
              <fieldset>
                <legend className="text-sm font-medium text-slate-gray mb-2">
                  How should stimulus types be selected?
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {([
                    {
                      value: "auto" as const,
                      label: "Auto",
                      description: "Randomly select a stimulus type for each question.",
                    },
                    {
                      value: "custom" as const,
                      label: "Specify counts",
                      description: "Set the exact number for each stimulus type.",
                    },
                  ]).map((option) => {
                    const selected = settings.stimulusSelectionMode === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                          selected
                            ? "border-[var(--assignment-completed)] bg-[var(--assignment-calendar-nav-bg)]"
                            : "border-border-default hover:bg-foreground/5"
                        }`}
                      >
                        <input
                          type="radio"
                          name="stimulus-selection-mode"
                          value={option.value}
                          checked={selected}
                          onChange={() =>
                            setSettings((prev) => ({
                              ...prev,
                              stimulusSelectionMode: option.value,
                            }))
                          }
                          className="mt-0.5 h-4 w-4 border-border-default accent-[var(--assignment-completed)]"
                        />
                        <span>
                          <span className="block text-sm font-medium text-slate-gray">
                            {option.label}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {settings.stimulusSelectionMode === "auto" ? (
                <div className="rounded-xl bg-[var(--assignment-calendar-nav-bg)] p-3 text-sm text-slate-gray">
                  Each question will independently receive a random stimulus
                  type. Multiple-choice questions may also be text-only.
                </div>
              ) : (
                <>
                  <div className="flex justify-end mb-1">
                    <button
                      onClick={handleAutoDistributeDiagrams}
                      className="text-xs text-[var(--assignment-completed)] hover:brightness-110 font-medium"
                    >
                      Auto distribute
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
                    {(Object.keys(STIMULUS_LABELS) as StimulusType[]).map((type) => (
                      <div key={type}>
                        <label className="block text-sm text-slate-gray mb-1">
                          {STIMULUS_LABELS[type]}
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={settings.stimulusConfig[type] || ""}
                          onChange={(e) => handleStimulusCountChange(type, e.target.value)}
                          placeholder="0"
                          className="w-20 rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 text-center"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 p-3 rounded-lg bg-slate-gray/5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Stimulus questions:</span>
                  <span className="font-medium text-slate-gray">
                    {totalStimulusCount}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Text-only questions:</span>
                  <span className="font-medium text-slate-gray">
                    {textOnlyCount}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1 pt-1 border-t border-border-subtle">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-medium text-slate-gray">
                    {totalQuestionTarget}
                  </span>
                </div>
                  </div>
                </>
              )}
          </div>
        </section>

        {/* Advanced Settings */}
        <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] shadow-[var(--assignment-card-shadow)] overflow-hidden">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between p-6 text-left hover:bg-foreground/5"
          >
            <h2 className="text-lg font-medium text-slate-gray">
              Advanced Settings
            </h2>
            {showAdvanced ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </button>

          {showAdvanced && (
            <div className="px-6 pb-6 border-t border-border-subtle pt-4">
              <label className="block text-sm font-medium text-slate-gray mb-2">
                Custom Instructions (Optional)
              </label>
              <textarea
                value={settings.customPrompt}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    customPrompt: e.target.value,
                  }))
                }
                placeholder="Add any specific instructions for the AI, e.g., 'Focus on photosynthesis concepts' or 'Include more application-based questions'"
                rows={4}
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                These instructions will be added to the generation prompt.
              </p>
            </div>
          )}
        </section>

        {/* Error Message */}
        {error && (
          <div className="p-4 rounded-lg bg-error-light border border-error-border text-error text-sm">
            {error}
          </div>
        )}

        {/* Per-item warnings (failed short-answer items) */}
        {warnings.length > 0 && (
          <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <p className="font-medium mb-1">Some items could not be generated:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Generate Button */}
        <div className="flex items-center justify-end gap-4">
          {isGenerating && progress && (
            <span className="text-sm text-muted-foreground">{progress}</span>
          )}
          {isGenerating && (
            <span className="text-sm text-muted-foreground">
              Elapsed: {formatTime(elapsedTime)}
            </span>
          )}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-heading font-bold transition duration-200 hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed border-[1.5px] border-[var(--assignment-glass-border)] bg-[var(--assignment-cta-bg-strong)] text-[var(--assignment-cta-text)] shadow-[var(--assignment-cta-elevated-shadow)]"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate Questions
              </>
            )}
          </button>
        </div>
      </div>
    </main>
  );
}
