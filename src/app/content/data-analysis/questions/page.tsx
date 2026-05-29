"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Download, RefreshCw } from "lucide-react";
import { DiagramRenderer } from "@/components/diagrams/DiagramRenderer";
import { LatexText } from "@/components/shared/LatexText";
import type { Diagram } from "@/types/question";
import { DataAnalysisTabs } from "../tabs";
import { SchoolFilter } from "../school-filter";
import {
  badgeAmber,
  badgeEmerald,
  buttonOutlinePrimary,
} from "@/lib/ui/status-badge-styles";

type ModeSlice = {
  mode: string;
  attempts: number;
  uniqueUsers: number;
  correct: number;
  accuracy: number;
  timeP50: number | null;
  timeP90: number | null;
  timeAvg: number | null;
};

type ChoiceSlice = {
  mode: string;
  optionId: string;
  n: number;
  share: number;
  isCorrectChoice: boolean;
};

type QuestionOptionPreview = {
  id: string;
  text: string;
};

type QuestionPreview = {
  text: string;
  imageUrl: string | null;
  options: QuestionOptionPreview[];
  correctOptionId: string;
  diagram: { type: string; data: unknown } | null;
};

type ConfidenceLevelKey = "not_sure" | "somewhat" | "sure";

type ConfidenceBucket = {
  total: number;
  correct: number;
  incorrect: number;
};

type ConfidenceSummary = {
  total: number;
  byLevel: Record<ConfidenceLevelKey, ConfidenceBucket>;
  overconfidentWrong: number;
  underconfidentRight: number;
};

type QuestionSummary = {
  questionId: string;
  standardId: string | null;
  standardLabel: string | null;
  totalAttempts: number;
  totalUniqueUsers: number;
  overall: ModeSlice;
  modes: Record<"practice" | "exam" | "review", ModeSlice | null>;
  practiceFirstAttempt: {
    n: number;
    correct: number;
    accuracy: number;
  } | null;
  choiceStats: ChoiceSlice[];
  firstAnsweredAt: string | null;
  lastAnsweredAt: string | null;
  question: QuestionPreview | null;
  confidence: ConfidenceSummary;
};

type StandardOption = {
  value: string;
  label: string;
};

type SortKey =
  | "questionId"
  | "standardId"
  | "attempts"
  | "accuracy"
  | "firstAttempt"
  | "timeP50"
  | "timeP90"
  | "practiceExamGap";

const LOW_N_THRESHOLD = 20;
const TOO_EASY_THRESHOLD = 0.95;
const TOO_HARD_THRESHOLD = 0.2;
const CONFIDENCE_LEVELS: ConfidenceLevelKey[] = ["sure", "somewhat", "not_sure"];
const CONFIDENCE_LABELS: Record<ConfidenceLevelKey, string> = {
  sure: "Sure",
  somewhat: "Somewhat",
  not_sure: "Not sure",
};

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${Math.round(value * 1000) / 10}%`;
}

function formatSeconds(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "-";
  return `${Math.round(value * 10) / 10}s`;
}

function computePracticeExamGap(row: QuestionSummary): number | null {
  const practice = row.modes.practice;
  const exam = row.modes.exam;
  if (!practice || !exam || practice.attempts === 0 || exam.attempts === 0) return null;
  return practice.accuracy - exam.accuracy;
}

function getBadges(row: QuestionSummary): Array<{ label: string; tone: "warning" | "info" }> {
  const badges: Array<{ label: string; tone: "warning" | "info" }> = [];
  if (row.totalAttempts < LOW_N_THRESHOLD) {
    badges.push({ label: `low n (${row.totalAttempts})`, tone: "info" });
  }
  if (row.totalAttempts >= LOW_N_THRESHOLD && row.overall.accuracy >= TOO_EASY_THRESHOLD) {
    badges.push({ label: "too easy (>95%)", tone: "warning" });
  }
  if (row.totalAttempts >= LOW_N_THRESHOLD && row.overall.accuracy < TOO_HARD_THRESHOLD) {
    badges.push({ label: "too hard (<20%)", tone: "warning" });
  }
  const distractorOnlyInOverall = row.choiceStats.filter((c) => c.mode === "practice");
  if (distractorOnlyInOverall.length > 0) {
    const anyUnused = distractorOnlyInOverall.some(
      (choice) => !choice.isCorrectChoice && choice.share < 0.02,
    );
    if (anyUnused) {
      badges.push({ label: "unused distractor", tone: "warning" });
    }
  }
  const gap = computePracticeExamGap(row);
  if (gap !== null && gap > 0.25 && row.modes.practice && row.modes.exam && row.modes.practice.attempts >= LOW_N_THRESHOLD && row.modes.exam.attempts >= LOW_N_THRESHOLD) {
    badges.push({ label: `practice − exam gap ${Math.round(gap * 100)}pp`, tone: "warning" });
  }
  return badges;
}

export default function QuestionQualityPage() {
  const [rows, setRows] = useState<QuestionSummary[]>([]);
  const [standards, setStandards] = useState<StandardOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schoolIds, setSchoolIds] = useState<string[]>([]);
  const [standardFilter, setStandardFilter] = useState("");
  const [minN, setMinN] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("attempts");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (schoolIds.length > 0) params.set("schoolIds", schoolIds.join(","));
    if (standardFilter.trim()) params.set("standardId", standardFilter.trim());
    if (minN > 0) params.set("minN", String(minN));

    const response = await fetch(`/api/admin/analytics/questions?${params.toString()}`, {
      cache: "no-store",
      credentials: "include",
    });

    const payload = (await response.json()) as {
      error?: string;
      questions?: QuestionSummary[];
      meta?: {
        standards?: StandardOption[];
      };
    };

    if (!response.ok) {
      setError(payload.error ?? "Failed to load question stats.");
      setLoading(false);
      return;
    }

    setRows(payload.questions ?? []);
    setStandards(payload.meta?.standards ?? []);
    setLoading(false);
  }, [minN, schoolIds, standardFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    const direction = sortDir === "asc" ? 1 : -1;

    const getValue = (row: QuestionSummary): number | string | null => {
      switch (sortKey) {
        case "questionId":
          return row.questionId;
        case "standardId":
          return row.standardId ?? "";
        case "attempts":
          return row.totalAttempts;
        case "accuracy":
          return row.overall.accuracy;
        case "firstAttempt":
          return row.practiceFirstAttempt?.accuracy ?? null;
        case "timeP50":
          return row.overall.timeP50;
        case "timeP90":
          return row.overall.timeP90;
        case "practiceExamGap":
          return computePracticeExamGap(row);
      }
    };

    copy.sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * direction;
      }
      return ((av as number) - (bv as number)) * direction;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "questionId" || key === "standardId" ? "asc" : "desc");
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return sortDir === "asc" ? <ArrowUp className="inline w-3 h-3 ml-1" /> : <ArrowDown className="inline w-3 h-3 ml-1" />;
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-heading mb-2">
          Question Quality Diagnostics
        </h1>
      </header>

      <DataAnalysisTabs active="questions" />

      <section className="rounded-xl border border-primary/25 bg-surface p-4 sm:p-5 shadow-sm mb-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <SchoolFilter value={schoolIds} onChange={setSchoolIds} />
          <label className="text-sm text-slate-gray">
            <span className="block mb-1 font-medium">Standard</span>
            <select
              value={standardFilter}
              onChange={(event) => setStandardFilter(event.target.value)}
              className="w-full rounded-lg border border-border-default px-3 py-2"
            >
              <option value="">All standards</option>
              {standards.map((standard) => (
                <option key={standard.value} value={standard.value}>
                  {standard.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-gray">
            <span className="block mb-1 font-medium">Minimum attempts</span>
            <input
              type="number"
              min={0}
              value={minN}
              onChange={(event) => setMinN(Math.max(0, Number.parseInt(event.target.value, 10) || 0))}
              className="w-full rounded-lg border border-border-default px-3 py-2"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => void fetchData()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={() => downloadQuestionsCsv(sortedRows)}
            disabled={sortedRows.length === 0}
            className={buttonOutlinePrimary}
          >
            <Download className="w-4 h-4" />
            Download CSV
          </button>
          <span className="text-xs text-muted-foreground">
            {sortedRows.length} question{sortedRows.length === 1 ? "" : "s"} shown
          </span>
        </div>
      </section>

      {error && (
        <p className="rounded-lg border border-error-border bg-error-light px-3 py-2 text-sm text-error mb-4">
          {error}
        </p>
      )}

      <section className="rounded-xl border border-primary/25 bg-surface shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading question stats...</p>
        ) : sortedRows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No question attempts match the current filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border-default text-left text-muted-foreground">
                  <th className="w-8 px-2 py-2"></th>
                  <SortHeader label="Question" active={sortKey === "questionId"} onClick={() => toggleSort("questionId")} indicator={sortIndicator("questionId")} />
                  <SortHeader label="Standard" active={sortKey === "standardId"} onClick={() => toggleSort("standardId")} indicator={sortIndicator("standardId")} />
                  <SortHeader label="n" active={sortKey === "attempts"} onClick={() => toggleSort("attempts")} indicator={sortIndicator("attempts")} />
                  <SortHeader label="Accuracy" active={sortKey === "accuracy"} onClick={() => toggleSort("accuracy")} indicator={sortIndicator("accuracy")} />
                  <SortHeader label="1st-attempt (Practice)" active={sortKey === "firstAttempt"} onClick={() => toggleSort("firstAttempt")} indicator={sortIndicator("firstAttempt")} />
                  <SortHeader label="Practice − Exam" active={sortKey === "practiceExamGap"} onClick={() => toggleSort("practiceExamGap")} indicator={sortIndicator("practiceExamGap")} />
                  <SortHeader label="Time p50" active={sortKey === "timeP50"} onClick={() => toggleSort("timeP50")} indicator={sortIndicator("timeP50")} />
                  <SortHeader label="Time p90" active={sortKey === "timeP90"} onClick={() => toggleSort("timeP90")} indicator={sortIndicator("timeP90")} />
                  <th className="px-2 py-2 font-medium">Flags</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const gap = computePracticeExamGap(row);
                  const isExpanded = expandedId === row.questionId;
                  const badges = getBadges(row);
                  return (
                    <Fragment key={row.questionId}>
                      <tr
                        className="border-b border-border-subtle hover:bg-surface-muted cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : row.questionId)}
                      >
                        <td className="px-2 py-2 text-muted-foreground">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="px-2 py-2 font-mono text-xs text-slate-gray/80 max-w-[220px] truncate" title={row.questionId}>
                          {row.questionId}
                        </td>
                        <td className="px-2 py-2 text-slate-gray/80">
                          {row.standardId ?? "-"}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">{row.totalAttempts}</td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {formatPercent(row.overall.accuracy)}
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({row.overall.correct}/{row.overall.attempts})
                          </span>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {row.practiceFirstAttempt
                            ? `${formatPercent(row.practiceFirstAttempt.accuracy)} (n=${row.practiceFirstAttempt.n})`
                            : "-"}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {gap === null ? "-" : `${gap >= 0 ? "+" : ""}${Math.round(gap * 1000) / 10}pp`}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">{formatSeconds(row.overall.timeP50)}</td>
                        <td className="px-2 py-2 whitespace-nowrap">{formatSeconds(row.overall.timeP90)}</td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-1">
                            {badges.length === 0 ? (
                              <span className="text-xs text-muted-foreground">-</span>
                            ) : (
                              badges.map((badge) => (
                                <span
                                  key={badge.label}
                                  className={
                                    badge.tone === "warning"
                                      ? `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${badgeAmber}`
                                      : "inline-flex items-center gap-1 rounded-full bg-surface-muted border border-border-default text-muted-foreground px-2 py-0.5 text-[10px]"
                                  }
                                >
                                  {badge.tone === "warning" && <AlertTriangle className="w-3 h-3" />}
                                  {badge.label}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-b border-border-subtle bg-surface-muted/60">
                          <td colSpan={10} className="px-4 py-4">
                            <QuestionDetail row={row} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

interface SortHeaderProps {
  label: string;
  active: boolean;
  onClick: () => void;
  indicator: React.ReactNode;
}

function SortHeader({ label, active, onClick, indicator }: SortHeaderProps) {
  return (
    <th
      className={`px-2 py-2 font-medium cursor-pointer select-none ${active ? "text-slate-gray" : "hover:text-foreground"}`}
      onClick={onClick}
    >
      {label}
      {indicator}
    </th>
  );
}

function QuestionDetail({ row }: { row: QuestionSummary }) {
  const modesOrder: Array<"practice" | "exam" | "review"> = ["practice", "exam", "review"];

  const choicesByMode = useMemo(() => {
    const map = new Map<string, ChoiceSlice[]>();
    for (const choice of row.choiceStats) {
      const list = map.get(choice.mode) ?? [];
      list.push(choice);
      map.set(choice.mode, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.n - a.n);
    }
    return map;
  }, [row.choiceStats]);

  const confidenceRows = CONFIDENCE_LEVELS.map((level) => ({
    level,
    bucket: row.confidence.byLevel[level],
  }));
  const confidenceTotal = row.confidence.total;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border-default bg-surface p-4">
        <h3 className="text-sm font-semibold text-slate-gray mb-2">Question preview</h3>
        {row.question ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-gray leading-relaxed">
              <LatexText text={row.question.text} />
            </p>
            {row.question.imageUrl && (
              <div className="overflow-hidden rounded-lg border border-border-default bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={row.question.imageUrl}
                  alt="Question visual"
                  className="max-h-72 w-full object-contain"
                />
              </div>
            )}
            {row.question.diagram && (
              <div className="rounded-lg border border-border-default bg-surface-muted p-3">
                <DiagramRenderer diagram={row.question.diagram as Diagram} />
              </div>
            )}
            <div className="space-y-1">
              {row.question.options.map((option, index) => {
                const isCorrect = option.id === row.question?.correctOptionId;
                const label =
                  /^[A-Z]$/.test(option.id)
                    ? option.id
                    : String.fromCharCode(65 + index);
                return (
                  <div
                    key={option.id}
                    className={`rounded-md border px-3 py-2 text-sm ${
                      isCorrect
                        ? badgeEmerald
                        : "border-border-default bg-surface text-slate-gray"
                    }`}
                  >
                    <span className="mr-2 font-semibold">{label}.</span>
                    <LatexText text={option.text} />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Question text is not available in generated_questions/assignment snapshots for this id.
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
        <h3 className="text-sm font-semibold text-slate-gray mb-2">Mode comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border-default">
                <th className="px-2 py-1 text-left font-medium">Mode</th>
                <th className="px-2 py-1 text-left font-medium">n</th>
                <th className="px-2 py-1 text-left font-medium">Users</th>
                <th className="px-2 py-1 text-left font-medium">Accuracy</th>
                <th className="px-2 py-1 text-left font-medium">p50</th>
                <th className="px-2 py-1 text-left font-medium">p90</th>
              </tr>
            </thead>
            <tbody>
              {modesOrder.map((mode) => {
                const slice = row.modes[mode];
                return (
                  <tr key={mode} className="border-b border-border-subtle">
                    <td className="px-2 py-1 capitalize">{mode}</td>
                    {slice ? (
                      <>
                        <td className="px-2 py-1">{slice.attempts}</td>
                        <td className="px-2 py-1">{slice.uniqueUsers}</td>
                        <td className="px-2 py-1">
                          {formatPercent(slice.accuracy)}
                          <span className="ml-1 text-muted-foreground">
                            ({slice.correct}/{slice.attempts})
                          </span>
                        </td>
                        <td className="px-2 py-1">{formatSeconds(slice.timeP50)}</td>
                        <td className="px-2 py-1">{formatSeconds(slice.timeP90)}</td>
                      </>
                    ) : (
                      <td className="px-2 py-1 text-muted-foreground" colSpan={5}>
                        No attempts
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {row.practiceFirstAttempt && (
          <p className="mt-2 text-xs text-muted-foreground">
            Practice 1st-attempt accuracy:{" "}
            <span className="font-semibold text-slate-gray">
              {formatPercent(row.practiceFirstAttempt.accuracy)}
            </span>{" "}
            ({row.practiceFirstAttempt.correct}/{row.practiceFirstAttempt.n}). Gap vs. overall
            Practice:{" "}
            {row.modes.practice
              ? `${Math.round((row.modes.practice.accuracy - row.practiceFirstAttempt.accuracy) * 1000) / 10}pp uplift from scaffolding`
              : "-"}
          </p>
        )}
        </div>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-gray mb-2">Choice selection rate</h3>
            <div className="space-y-4">
              {modesOrder.map((mode) => {
                const list = choicesByMode.get(mode);
                if (!list || list.length === 0) return null;
                return (
                  <div key={mode}>
                    <p className="text-xs font-medium text-muted-foreground capitalize mb-1">{mode}</p>
                    <ul className="space-y-1">
                      {list.map((choice) => (
                        <li key={`${mode}-${choice.optionId}`} className="text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`font-mono truncate max-w-[240px] ${
                                choice.isCorrectChoice ? "text-forest font-semibold" : "text-slate-gray"
                              }`}
                              title={choice.optionId}
                            >
                              {choice.optionId}
                              {choice.isCorrectChoice && (
                                <span className="ml-1 rounded bg-green-100 px-1 text-[10px] text-green-800">correct</span>
                              )}
                            </span>
                            <span className="text-muted-foreground whitespace-nowrap">
                              {formatPercent(choice.share)} ({choice.n})
                            </span>
                          </div>
                          <div className="mt-0.5 h-1.5 w-full rounded bg-surface-muted overflow-hidden">
                            <div
                              className={
                                choice.isCorrectChoice
                                  ? "h-full bg-primary"
                                  : "h-full bg-slate-400"
                              }
                              style={{ width: `${Math.min(100, choice.share * 100)}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-border-default bg-surface p-3">
            <h3 className="text-sm font-semibold text-slate-gray mb-2">Confidence distribution</h3>
            {confidenceTotal === 0 ? (
              <p className="text-xs text-muted-foreground">No confidence submissions for this question yet.</p>
            ) : (
              <>
                <ul className="space-y-2">
                  {confidenceRows.map(({ level, bucket }) => {
                    const share = confidenceTotal > 0 ? bucket.total / confidenceTotal : 0;
                    const accuracy = bucket.total > 0 ? bucket.correct / bucket.total : null;
                    return (
                      <li key={level}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-gray">{CONFIDENCE_LABELS[level]}</span>
                          <span className="text-muted-foreground">
                            {bucket.total} ({Math.round(share * 100)}%) · {accuracy === null ? "—" : `${Math.round(accuracy * 100)}% correct`}
                          </span>
                        </div>
                        <div className="mt-0.5 h-1.5 w-full rounded bg-surface-muted overflow-hidden">
                          <div
                            className="h-full bg-primary/70"
                            style={{ width: `${Math.min(100, share * 100)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  Overconfident wrong: {row.confidence.overconfidentWrong} · Underconfident right:{" "}
                  {row.confidence.underconfidentRight}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadQuestionsCsv(rows: QuestionSummary[]) {
  const header = [
    "question_id",
    "standard_id",
    "standard_label",
    "total_attempts",
    "unique_users",
    "overall_accuracy",
    "first_attempt_accuracy",
    "first_attempt_n",
    "practice_attempts",
    "practice_accuracy",
    "exam_attempts",
    "exam_accuracy",
    "review_attempts",
    "review_accuracy",
    "time_p50_sec",
    "time_p90_sec",
    "first_answered_at",
    "last_answered_at",
  ].map(csvCell).join(",");

  const lines = rows.map((row) => {
    const p = row.modes.practice;
    const e = row.modes.exam;
    const r = row.modes.review;
    return [
      row.questionId,
      row.standardId,
      row.standardLabel,
      row.totalAttempts,
      row.totalUniqueUsers,
      row.overall.accuracy,
      row.practiceFirstAttempt?.accuracy ?? "",
      row.practiceFirstAttempt?.n ?? "",
      p?.attempts ?? "",
      p?.accuracy ?? "",
      e?.attempts ?? "",
      e?.accuracy ?? "",
      r?.attempts ?? "",
      r?.accuracy ?? "",
      row.overall.timeP50 ?? "",
      row.overall.timeP90 ?? "",
      row.firstAnsweredAt ?? "",
      row.lastAnsweredAt ?? "",
    ].map(csvCell).join(",");
  });

  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const today = new Date().toISOString().slice(0, 10);
  a.download = `question-quality_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
