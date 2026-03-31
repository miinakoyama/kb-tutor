"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Loader2,
} from "lucide-react";
import type { DOKLevel } from "@/types/question";
import {
  getAllStandards,
  getStandardsByFilter,
  getStandardsForModule,
  MODULE_TITLES,
  type ModuleCode,
} from "@/lib/standards";

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

interface DiagramConfig {
  chart: number;
  table: number;
  flowchart: number;
  diagram: number;
}

interface GenerationSettings {
  questionSetName: string;
  questionCount: number;
  topics: string[];
  standards: string[];
  standardCounts: Record<string, number>;
  dokLevels: DOKLevel[];
  includeDiagrams: boolean;
  diagramConfig: DiagramConfig;
  customPrompt: string;
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
  includeDiagrams: false,
  diagramConfig: {
    chart: 0,
    table: 0,
    flowchart: 0,
    diagram: 0,
  },
  customPrompt: "",
};

const STORAGE_KEY = "massProductionSettings";

export default function MassProductionPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<GenerationSettings>(DEFAULT_SETTINGS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [expandedTopics, setExpandedTopics] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const merged: GenerationSettings = { ...DEFAULT_SETTINGS, ...parsed };

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
        const resolvedStandardCounts =
          assignedTotal === merged.questionCount
            ? normalizedStandardCounts
            : distributeStandardCounts(selectedStandards, merged.questionCount);

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

  const totalDiagramCount =
    settings.diagramConfig.chart +
    settings.diagramConfig.table +
    settings.diagramConfig.flowchart +
    settings.diagramConfig.diagram;
  const totalAssignedStandardCount = ALL_STANDARDS.reduce(
    (sum, standard) => sum + (settings.standardCounts[standard.id] ?? 0),
    0
  );
  const isStandardCountValid =
    totalAssignedStandardCount === settings.questionCount;
  const activeStandardIds = ALL_STANDARDS
    .map((standard) => standard.id)
    .filter((standardId) => (settings.standardCounts[standardId] ?? 0) > 0);

  const textOnlyCount = Math.max(0, settings.questionCount - totalDiagramCount);

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
        prev.questionCount
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
    setSettings((prev) => ({
      ...prev,
      standardCounts: {
        ...prev.standardCounts,
        [standardId]: Math.max(0, Math.min(value, prev.questionCount)),
      },
    }));
  };

  const handleDiagramCountChange = (type: keyof DiagramConfig, rawValue: string) => {
    const value = rawValue === "" ? 0 : parseInt(rawValue, 10);
    if (isNaN(value)) return;
    setSettings((prev) => ({
      ...prev,
      diagramConfig: {
        ...prev.diagramConfig,
        [type]: Math.max(0, Math.min(value, prev.questionCount)),
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
    if (!trimmedSetName) {
      setError("Please enter a question set name.");
      return;
    }
    if (settings.dokLevels.length === 0) {
      setError("Please select at least one DOK level.");
      return;
    }
    if (activeStandardIds.length === 0) {
      setError("Please set count > 0 for at least one standard.");
      return;
    }
    if (totalAssignedStandardCount !== settings.questionCount) {
      setError(
        `Standard counts must sum to ${settings.questionCount}. Current total: ${totalAssignedStandardCount}.`
      );
      return;
    }
    if (totalDiagramCount > settings.questionCount) {
      setError("Total diagram count cannot exceed question count.");
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const payload = {
        ...settings,
        topics: TOPIC_SELECTIONS.filter((selection) =>
          getStandardsForSelection(selection.key).some(
            (standard) => (settings.standardCounts[standard.id] ?? 0) > 0
          )
        ).map((selection) => selection.key),
        standards: activeStandardIds,
        questionSetName: trimmedSetName,
        standardCounts: Object.fromEntries(
          activeStandardIds.map((standardId) => [
            standardId,
            settings.standardCounts[standardId] ?? 0,
          ])
        ),
      };

      const response = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to generate questions");
      }

      const data = await response.json();

      const generatedAt = new Date().toISOString();
      const { addGeneratedQuestionSet } = await import("@/lib/question-storage");
      const setId = addGeneratedQuestionSet(
        data.questions,
        trimmedSetName,
        generatedAt,
        {
          id: data.generationModelId,
          label: data.generationModelLabel,
        }
      );

      router.push(`/content/questions/${encodeURIComponent(setId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsGenerating(false);
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <Link
        href="/content"
        className="inline-flex items-center gap-2 text-base font-semibold text-[#14532d] hover:text-[#166534] transition-colors mb-6"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#16a34a]/10">
          <ArrowLeft className="w-4 h-4 text-[#14532d]" />
        </span>
        Back to Content Management
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <Sparkles className="w-6 h-6 text-[#16a34a]" />
        <div>
          <h1 className="text-xl font-bold text-slate-gray">
            LLM Mass Production
          </h1>
          <p className="text-sm text-slate-gray/70">
            Generate questions at scale using AI
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Question Set Name */}
        <section className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm">
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
              className="w-full max-w-md px-3 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16a34a]/50"
              required
            />
            <p className="text-xs text-slate-gray/60 mt-1">
              Required: this name is used to identify the generated set later.
            </p>
          </div>
        </section>

        {/* Basic Settings */}
        <section className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-gray mb-4">
            Basic Settings
          </h2>

          {/* Question Count */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-gray mb-2">
              Number of Questions
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
              onBlur={() => {
                if (settings.questionCount < 1) {
                  setSettings((prev) => ({
                    ...prev,
                    questionCount: 1,
                  }));
                }
              }}
              placeholder="5"
              className="w-24 px-3 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16a34a]/50 text-center"
            />
            <p className="text-xs text-slate-gray/60 mt-1">1-20 questions per batch</p>
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
                  className="text-xs text-[#16a34a] hover:text-[#15803d] font-medium"
                >
                  Auto distribute
                </button>
                <button
                  onClick={handleClearAllCounts}
                  className="text-xs text-[#16a34a] hover:text-[#15803d] font-medium"
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
                    className="rounded-lg border border-slate-200 overflow-hidden"
                  >
                    <div className="flex items-center justify-between gap-2 p-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {hasStandards && (
                          <button
                            type="button"
                            onClick={() => toggleTopicExpansion(selection.key)}
                            className="inline-flex items-center justify-center w-6 h-6 rounded hover:bg-slate-100 text-slate-gray/70 hover:text-slate-gray"
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
                          <span className="text-xs text-slate-gray/60">
                            ({selectedCount}/{topicStandards.length})
                          </span>
                        )}
                      </div>
                    </div>

                    {isExpanded && hasStandards && (
                      <div className="border-t border-slate-200 bg-slate-50/70 px-3 py-2 space-y-1.5">
                        {topicStandards.map((standard) => (
                          <div
                            key={`${selection.key}-${standard.id}`}
                            className="flex items-start gap-3 p-1.5 rounded hover:bg-white"
                          >
                            <div className="flex-1 min-w-0 text-sm text-slate-gray">
                              <span className="font-medium">{standard.id}</span> -{" "}
                              {standard.label}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-xs text-slate-gray/60">Count</span>
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
                                className="w-14 px-2 py-1 border border-slate-gray/20 rounded-md text-center text-xs"
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
                  ? "border-[#16a34a]/30 bg-[#16a34a]/10 text-[#14532d]"
                  : "border-red-300 bg-red-50 text-red-700"
              }`}
            >
              <span className="font-medium">
                Total standard counts: {totalAssignedStandardCount} /{" "}
                {settings.questionCount} questions
              </span>
              {!isStandardCountValid && (
                <span className="block text-xs mt-1">
                  Adjust counts so the total matches the number of questions.
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
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-gray/5 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={settings.dokLevels.includes(level)}
                    onChange={() => handleDokToggle(level)}
                    className="w-4 h-4 mt-0.5 rounded border-slate-gray/30 text-[#16a34a] focus:ring-[#16a34a]/50"
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
                    <p className="text-xs text-slate-gray/60 mt-0.5">
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

        {/* Diagram Settings */}
        <section className="rounded-xl border border-[#16a34a]/30 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-gray mb-4">
            Diagram Settings
          </h2>

          <label className="flex items-center gap-3 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.includeDiagrams}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  includeDiagrams: e.target.checked,
                  diagramConfig: e.target.checked
                    ? prev.diagramConfig
                    : DEFAULT_SETTINGS.diagramConfig,
                }))
              }
              className="w-4 h-4 rounded border-slate-gray/30 text-[#16a34a] focus:ring-[#16a34a]/50"
            />
            <span className="text-sm font-medium text-slate-gray">
              Include questions with diagrams
            </span>
          </label>

          {settings.includeDiagrams && (
            <div className="space-y-4 pl-7">
              <p className="text-xs text-slate-gray/60 mb-3">
                Specify how many questions should include each diagram type.
                Remaining questions will be text-only.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm text-slate-gray mb-1">
                    Charts (Line/Bar)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={settings.diagramConfig.chart || ""}
                    onChange={(e) => handleDiagramCountChange("chart", e.target.value)}
                    placeholder="0"
                    className="w-20 px-3 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16a34a]/50 text-center"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-gray mb-1">
                    Tables
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={settings.diagramConfig.table || ""}
                    onChange={(e) => handleDiagramCountChange("table", e.target.value)}
                    placeholder="0"
                    className="w-20 px-3 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16a34a]/50 text-center"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-gray mb-1">
                    Flowcharts
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={settings.diagramConfig.flowchart || ""}
                    onChange={(e) => handleDiagramCountChange("flowchart", e.target.value)}
                    placeholder="0"
                    className="w-20 px-3 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16a34a]/50 text-center"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-gray mb-1">
                    Biology Diagrams
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={settings.diagramConfig.diagram || ""}
                    onChange={(e) => handleDiagramCountChange("diagram", e.target.value)}
                    placeholder="0"
                    className="w-20 px-3 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16a34a]/50 text-center"
                  />
                </div>
              </div>

              <div className="mt-4 p-3 rounded-lg bg-slate-gray/5">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-gray/70">Diagram questions:</span>
                  <span className="font-medium text-slate-gray">
                    {totalDiagramCount}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-slate-gray/70">Text-only questions:</span>
                  <span className="font-medium text-slate-gray">
                    {textOnlyCount}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1 pt-1 border-t border-slate-gray/10">
                  <span className="text-slate-gray/70">Total:</span>
                  <span className="font-medium text-slate-gray">
                    {settings.questionCount}
                  </span>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Advanced Settings */}
        <section className="rounded-xl border border-[#16a34a]/30 bg-white shadow-sm overflow-hidden">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between p-6 text-left hover:bg-slate-gray/5"
          >
            <h2 className="text-lg font-medium text-slate-gray">
              Advanced Settings
            </h2>
            {showAdvanced ? (
              <ChevronUp className="w-5 h-5 text-slate-gray/50" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-gray/50" />
            )}
          </button>

          {showAdvanced && (
            <div className="px-6 pb-6 border-t border-slate-gray/10 pt-4">
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
                className="w-full px-3 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16a34a]/50 text-sm resize-none"
              />
              <p className="text-xs text-slate-gray/60 mt-1">
                These instructions will be added to the generation prompt.
              </p>
            </div>
          )}
        </section>

        {/* Error Message */}
        {error && (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Generate Button */}
        <div className="flex items-center justify-end gap-4">
          {isGenerating && (
            <span className="text-sm text-slate-gray/60">
              Elapsed: {formatTime(elapsedTime)}
            </span>
          )}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-white font-medium bg-[#16a34a] hover:bg-[#15803d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
