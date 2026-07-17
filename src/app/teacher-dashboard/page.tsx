"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Download,
  Info,
  Search,
  Timer,
  X,
} from "lucide-react";
import { StudentAvatar } from "@/components/StudentAvatar";
import { InfoPopover } from "@/components/InfoPopover";
import { PerformanceThresholdsCard } from "@/components/PerformanceThresholdsCard";
import { FeedbackSettingsCard } from "@/components/short-answer/FeedbackSettingsCard";
import { FeedbackReportsSection } from "@/components/short-answer/FeedbackReportsSection";
import { Button } from "@/components/ui/Button";
import { UnderlineTabs } from "@/components/shared/UnderlineTabs";
import {
  downloadStandardMetricsCsv,
  downloadStudentMetricsCsv,
} from "@/lib/csv/teacher-dashboard";
import type {
  StandardRow,
  StudentRow,
  DashboardSummary,
  ModeMetrics,
} from "@/lib/analytics/teacher-dashboard-server";
import {
  DEFAULT_PERFORMANCE_THRESHOLDS,
  LOW_AND_FAST_MAX_ACCURACY,
  LOW_AND_FAST_MAX_AVG_TIME_SEC,
  LOW_AND_FAST_MIN_ATTEMPTS,
  type PerformanceThresholds,
} from "@/lib/analytics/constants";
import {
  BAND_LABELS,
  BAND_TONES,
  describeStudentBands,
  findStandardBand,
  findStudentBand,
  type BandDescriptor,
} from "@/lib/analytics/band-display";
import { getAllStandards, MODULE_TITLES, type ModuleCode } from "@/lib/standards";
import { textAmber, textEmerald, textRose } from "@/lib/ui/status-badge-styles";

function accuracyToneClass(value: number, thresholds: PerformanceThresholds): string {
  if (value >= thresholds.advancedMin) return "text-emerald-800 dark:text-emerald-200";
  if (value >= thresholds.proficientMin) return textEmerald;
  if (value >= thresholds.basicMin) return textAmber;
  return textRose;
}
type RangeKey = "7d" | "30d" | "all";
type DashboardSection = "analytics" | "feedbackReports" | "feedbackSettings";
type ModeKey = "compare" | "practice" | "exam" | "review";
type AttemptModeKey = "practice" | "exam" | "review";
type SourceKey = "assigned" | "self" | "all";
type StudentStatusFilter =
  | "all"
  | "below_basic"
  | "basic"
  | "proficient"
  | "advanced"
  | "low_and_fast";
type StandardStatusFilter =
  | "all"
  | "below_basic"
  | "basic"
  | "proficient"
  | "advanced";

interface ClassOption {
  id: string;
  label: string;
}

interface StudentOption {
  id: string;
  label: string;
  classId: string | null;
  classIds?: string[];
}

interface StandardGroup {
  key: string;
  module: ModuleCode | null;
  category: string | null;
  rows: StandardRow[];
}

interface DashboardPayload {
  classes: ClassOption[];
  students: StudentOption[];
  topics: string[];
  summary: DashboardSummary;
  byStandard: StandardRow[];
  byStudent: StudentRow[];
  lowAndFastCount: number;
  thresholds: PerformanceThresholds;
  defaults: PerformanceThresholds;
  thresholdsAreCustom: boolean;
}

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

const MODE_TABS: { value: ModeKey; label: string; helper: string }[] = [
  {
    value: "compare",
    label: "Compare",
    helper:
      "Compare all modes side by side. Practice has scaffolding; exam does not — the gap highlights where re-teaching is needed.",
  },
  {
    value: "practice",
    label: "Practice",
    helper:
      "Practice mode — scaffolding available. Accuracy reflects learning in progress, not final mastery.",
  },
  {
    value: "exam",
    label: "Exam",
    helper:
      "Exam mode — students answer without scaffolding. Use accuracy as a signal of independent mastery.",
  },
  {
    value: "review",
    label: "Review",
    helper:
      "Review mode — students revisit previously answered questions. Ideal for closing recurring gaps.",
  },
];

const LEARNING_MODE_TABS: {
  value: AttemptModeKey;
  label: string;
  helper: string;
}[] = [
  {
    value: "practice",
    label: "Practice mode",
    helper:
      "Scaffolding available. Accuracy reflects learning in progress, not final mastery.",
  },
  {
    value: "exam",
    label: "Exam mode",
    helper:
      "Students answer without scaffolding. Use accuracy as a signal of independent mastery.",
  },
  {
    value: "review",
    label: "Review mode",
    helper:
      "Students revisit previously answered questions. Ideal for closing recurring gaps.",
  },
];

const ATTEMPT_MODES: AttemptModeKey[] = ["practice", "exam", "review"];
const MODE_LABELS: Record<AttemptModeKey, string> = {
  practice: "Practice",
  exam: "Exam",
  review: "Review",
};

const EMPTY_PAYLOAD: DashboardPayload = {
  classes: [],
  students: [],
  topics: [],
  summary: {
    completionRate: 0,
    studentsAttempted: 0,
    studentsTotal: 0,
    overallAccuracy: 0,
    avgTimeSec: 0,
    totalAnswered: 0,
    totalCorrect: 0,
    breakdown: {
      advanced: 0,
      proficient: 0,
      basic: 0,
      belowBasic: 0,
      notStarted: 0,
    },
  },
  byStandard: [],
  byStudent: [],
  lowAndFastCount: 0,
  thresholds: DEFAULT_PERFORMANCE_THRESHOLDS,
  defaults: DEFAULT_PERFORMANCE_THRESHOLDS,
  thresholdsAreCustom: false,
};

export default function TeacherDashboardPage() {
  return <TeacherDashboardContent />;
}

function TeacherDashboardContent() {
  const router = useRouter();
  const [topic, setTopic] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [range, setRange] = useState<RangeKey>("30d");
  const [mode, setMode] = useState<ModeKey>("compare");
  const [source, setSource] = useState<SourceKey>("all");
  const [standardFilter, setStandardFilter] =
    useState<StandardStatusFilter>("all");
  const [studentFilter, setStudentFilter] =
    useState<StudentStatusFilter>("all");
  const [section, setSection] = useState<DashboardSection>("analytics");
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<DashboardPayload>(EMPTY_PAYLOAD);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    const controller = new AbortController();

    const load = async () => {
      setIsLoading(true);
      const params = new URLSearchParams({ range, mode, source });
      if (topic) params.set("topic", topic);
      if (classId) params.set("classId", classId);
      if (studentId) params.set("studentId", studentId);

      try {
        const response = await fetch(
          `/api/teacher-dashboard?${params.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (response.ok) {
          const json = (await response.json()) as DashboardPayload;
          if (isCurrent) {
            setData(json);
          }
        }
      } catch (error) {
        if (
          isCurrent &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          console.error("[teacher-dashboard] failed to load dashboard", error);
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    };
    void load();

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [topic, classId, studentId, range, mode, source, refreshKey]);

  const filteredStudents = useMemo(() => {
    if (!classId) return data.students;
    return data.students.filter((student) =>
      (student.classIds ?? [student.classId]).includes(classId),
    );
  }, [classId, data.students]);

  const filteredStandards = useMemo(() => {
    if (standardFilter === "all") return data.byStandard;
    return data.byStandard.filter((row) => row.status === standardFilter);
  }, [standardFilter, data.byStandard]);

  const standardGroupOrder = useMemo(() => {
    const seen = new Set<string>();
    const order: { module: ModuleCode; category: string }[] = [];
    for (const standard of getAllStandards()) {
      const key = `${standard.module}::${standard.category}`;
      if (seen.has(key)) continue;
      seen.add(key);
      order.push({ module: standard.module, category: standard.category });
    }
    return order;
  }, []);

  const standardGroups = useMemo(() => {
    const rowsByKey = new Map<string, StandardRow[]>();
    for (const row of filteredStandards) {
      const key = row.module && row.category ? `${row.module}::${row.category}` : "other";
      const rows = rowsByKey.get(key) ?? [];
      rows.push(row);
      rowsByKey.set(key, rows);
    }
    const groups: StandardGroup[] = [];
    for (const { module, category } of standardGroupOrder) {
      const key = `${module}::${category}`;
      const rows = rowsByKey.get(key);
      if (!rows || rows.length === 0) continue;
      groups.push({ key, module, category, rows });
    }
    const otherRows = rowsByKey.get("other");
    if (otherRows && otherRows.length > 0) {
      groups.push({ key: "other", module: null, category: null, rows: otherRows });
    }
    return groups;
  }, [filteredStandards, standardGroupOrder]);

  const [collapsedStandardGroups, setCollapsedStandardGroups] = useState<
    Set<string>
  >(new Set());
  const toggleStandardGroup = (key: string) => {
    setCollapsedStandardGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const filteredStudentRows = useMemo(() => {
    if (studentFilter === "all") return data.byStudent;
    if (studentFilter === "low_and_fast") {
      return data.byStudent.filter((row) => row.isLowAndFast);
    }
    return data.byStudent.filter((row) => row.status === studentFilter);
  }, [studentFilter, data.byStudent]);

  const standardDetailQuery = useMemo(() => {
    const params = new URLSearchParams({ range, mode, source });
    if (classId) params.set("classId", classId);
    if (studentId) params.set("studentId", studentId);
    return params.toString();
  }, [range, mode, source, classId, studentId]);

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-10 sm:px-6 sm:py-12 lg:px-10 lg:py-14 xl:px-12">
      <section className="mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-heading">
            Teacher Dashboard
          </h1>
        </div>
      </section>

      <DashboardSectionTabs value={section} onChange={setSection} />

      {section === "analytics" && (
        <>
          <FiltersBar
            topic={topic}
            classId={classId}
            studentId={studentId}
            range={range}
            source={source}
            topics={data.topics}
            classes={data.classes}
            students={filteredStudents}
            onTopicChange={setTopic}
            onClassChange={(value) => {
              setClassId(value);
              setStudentId("");
            }}
            onStudentChange={setStudentId}
            onRangeChange={setRange}
            onSourceChange={setSource}
          />

          <ModeTabs
            value={mode}
            onChange={setMode}
            thresholds={data.thresholds}
            defaults={data.defaults}
            thresholdsAreCustom={data.thresholdsAreCustom}
            onThresholdsChange={() => setRefreshKey((prev) => prev + 1)}
          />

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <KpiCard
          label="Active Students"
          value={`${data.summary.completionRate}%`}
          helper={activeStudentsHelper(data.summary, mode)}
          accentClass="text-[var(--assignment-completed)]"
          info={
            <>
              Calculated as{" "}
              <span className="font-mono">
                students_with_attempts ÷ students_in_class × 100
              </span>
              . A student counts as &quot;active&quot; if they have at least
              one attempt in the selected date range and mode.
            </>
          }
        />
        {mode === "compare" ? (
          <ModeAccuracyCard
            summary={data.summary}
            thresholds={data.thresholds}
          />
        ) : (
          <KpiCard
            label="Overall Accuracy"
            value={`${data.summary.overallAccuracy}%`}
            helper={
              data.summary.totalAnswered > 0
                ? `${data.summary.totalCorrect.toLocaleString()} correct of ${data.summary.totalAnswered.toLocaleString()} answered`
                : "no attempts yet"
            }
            accentClass="text-blue-700 dark:text-blue-300"
            info={
              <>
                Calculated as{" "}
                <span className="font-mono">
                  correct ÷ answered × 100
                </span>{" "}
                across all attempts in the active filters, rounded to the
                nearest whole percent.
              </>
            }
          />
        )}
        <KpiCard
          label="Avg Time / Question"
          value={formatDuration(data.summary.avgTimeSec)}
          helper={avgTimeHelper(data.summary.avgTimeSec)}
          accentClass={textAmber}
          info={
            <>
              Mean dwell time per question over the active filters. Attempts
              older than the time-tracking rollout (no recorded dwell) are
              excluded.
            </>
          }
        />
        <StudentBreakdownCard
          summary={data.summary}
          thresholds={data.thresholds}
        />
          </section>

          <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] shadow-[var(--assignment-card-shadow)] mb-6">
        <div className="flex flex-col gap-3 border-b border-border-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-gray">
              Performance by standard
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusFilterSelect
              label="Status"
              value={standardFilter}
              onChange={(value) =>
                setStandardFilter(value as StandardStatusFilter)
              }
              options={[
                {
                  value: "all",
                  label: "All statuses",
                  count: data.byStandard.length,
                },
                ...(
                  ["below_basic", "basic", "proficient", "advanced"] as const
                ).map((key) => ({
                  value: key,
                  label: findStandardBand(key, data.thresholds).label,
                  count: data.byStandard.filter((row) => row.status === key)
                    .length,
                })),
              ]}
            />
            <Button
              variant="outline"
              onClick={() => downloadStandardMetricsCsv(filteredStandards)}
            >
              <Download className="w-4 h-4" />
              Download CSV
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table
            className={`w-full text-sm ${mode === "compare" ? "min-w-[1040px]" : ""}`}
          >
            <thead>
              <tr className="bg-surface-muted/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
                <th className="w-[34%] px-5 py-3">Standard</th>
                {mode !== "compare" && (
                  <>
                    <th className="w-24 px-3 py-3 text-center">Attempted</th>
                    <th className="w-20 px-3 py-3 text-center">Correct</th>
                  </>
                )}
                {mode === "compare" ? (
                  <>
                    <th className="w-32 px-2 py-3 text-center">Practice</th>
                    <th className="w-32 px-2 py-3 text-center">Exam</th>
                    <th className="w-32 px-2 py-3 text-center">Review</th>
                  </>
                ) : (
                  <th className="w-32 px-3 py-3 text-center">Accuracy</th>
                )}
                <th className="w-24 px-3 py-3 text-center">Avg time</th>
                <th className="w-36 px-5 py-3">Status</th>
                <th className="w-8 px-3 py-3" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {filteredStandards.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-8 text-center text-sm text-slate-gray/60"
                  >
                    {isLoading
                      ? "Loading performance data..."
                      : "No data for the current filters."}
                  </td>
                </tr>
              ) : (
                standardGroups.map((group) => {
                  const isCollapsed = collapsedStandardGroups.has(group.key);
                  return (
                    <Fragment key={group.key}>
                      <tr
                        onClick={() => toggleStandardGroup(group.key)}
                        className="cursor-pointer border-t border-border-subtle bg-surface-muted/60"
                      >
                        <td colSpan={7} className="px-5 py-2">
                          <div className="flex items-center gap-2">
                            {isCollapsed ? (
                              <ChevronRight className="h-4 w-4 text-slate-gray/50" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-slate-gray/50" />
                            )}
                            {group.module && (
                              <span
                                title={MODULE_TITLES[group.module]}
                                className="rounded-full border border-[var(--assignment-glass-border)] bg-[var(--assignment-calendar-nav-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--assignment-completed)]"
                              >
                                Module {group.module}
                              </span>
                            )}
                            <span className="text-sm font-semibold text-slate-gray">
                              {group.category ?? "Other"}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {!isCollapsed &&
                        group.rows.map((row) => (
                          <tr
                            key={row.standardId}
                            onClick={() =>
                              router.push(
                                `/teacher-dashboard/standards/${encodeURIComponent(row.standardId)}?${standardDetailQuery}`,
                              )
                            }
                            className="cursor-pointer border-t border-border-subtle hover:bg-[var(--surface-muted)]"
                          >
                            <td className="px-5 py-3">
                              <Link
                                href={`/teacher-dashboard/standards/${encodeURIComponent(row.standardId)}?${standardDetailQuery}`}
                                onClick={(event) => event.stopPropagation()}
                                className="font-medium text-slate-gray hover:text-forest hover:underline"
                              >
                                {row.standardId}
                              </Link>
                              <p className="text-xs text-slate-gray/60 line-clamp-2 max-w-md">
                                {row.standardLabel}
                              </p>
                            </td>
                            {mode !== "compare" && (
                              <>
                                <td className="px-3 py-3 text-center text-slate-gray">
                                  {row.attempted}
                                </td>
                                <td className="px-3 py-3 text-center text-slate-gray">
                                  {row.correct}
                                </td>
                              </>
                            )}
                            {mode === "compare" ? (
                              <>
                                <td className="px-3 py-3">
                                  <ModeAccuracyCell
                                    metrics={row.byMode?.practice}
                                    thresholds={data.thresholds}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <ModeAccuracyCell
                                    metrics={row.byMode?.exam}
                                    thresholds={data.thresholds}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <ModeAccuracyCell
                                    metrics={row.byMode?.review}
                                    thresholds={data.thresholds}
                                  />
                                </td>
                              </>
                            ) : (
                              <td className="px-3 py-3 text-center">
                                <AccuracyValue
                                  value={row.accuracy}
                                  hasAttempts={row.attempted > 0}
                                  thresholds={data.thresholds}
                                />
                                <p className="mt-0.5 whitespace-nowrap text-[10px] text-slate-gray/50">
                                  {row.studentsAttempted === 0
                                    ? "no students"
                                    : `out of ${row.studentsAttempted} ${row.studentsAttempted === 1 ? "student" : "students"}`}
                                </p>
                              </td>
                            )}
                            <td className="px-3 py-3 text-center">
                              <span className="inline-flex items-center justify-center gap-1.5 text-slate-gray/70">
                                <Timer className="w-3.5 h-3.5 text-slate-gray/50" />
                                {row.averageTimeSec}s
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <StandardStatusBadge
                                status={row.status}
                                thresholds={data.thresholds}
                              />
                            </td>
                            <td className="px-3 py-3 text-right text-slate-gray/40">
                              <ChevronRight className="ml-auto h-4 w-4" />
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
          </section>

          <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] shadow-[var(--assignment-card-shadow)]">
        <div className="flex flex-col gap-3 border-b border-border-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-gray">
              {studentId ? "Student detail" : "All students"}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusFilterSelect
              label="Status"
              value={studentFilter}
              onChange={(value) =>
                setStudentFilter(value as StudentStatusFilter)
              }
              options={[
                {
                  value: "all",
                  label: "All statuses",
                  count: data.byStudent.length,
                },
                {
                  value: "low_and_fast",
                  label: "Click-through",
                  count: data.lowAndFastCount,
                },
                {
                  value: "below_basic",
                  label: findStudentBand("below_basic", data.thresholds).label,
                  count: data.summary.breakdown.belowBasic,
                },
                {
                  value: "basic",
                  label: findStudentBand("basic", data.thresholds).label,
                  count: data.summary.breakdown.basic,
                },
                {
                  value: "proficient",
                  label: findStudentBand("proficient", data.thresholds).label,
                  count: data.summary.breakdown.proficient,
                },
                {
                  value: "advanced",
                  label: findStudentBand("advanced", data.thresholds).label,
                  count: data.summary.breakdown.advanced,
                },
              ]}
            />
            <Button
              variant="outline"
              onClick={() => downloadStudentMetricsCsv(filteredStudentRows)}
            >
              <Download className="w-4 h-4" />
              Download CSV
            </Button>
          </div>
        </div>

        {data.lowAndFastCount > 0 && (
          <div className="flex items-center gap-2 border-b border-rose-100 bg-rose-50 px-5 py-2.5 text-sm text-rose-700 dark:border-rose-800/35 dark:bg-rose-950/40 dark:text-rose-200/90">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium">
              {data.lowAndFastCount} {data.lowAndFastCount === 1 ? "student" : "students"} showing
              click-through behavior
            </span>
            <InfoPopover label="What is click-through behavior?">
              Click-through behavior: avg time &lt; {LOW_AND_FAST_MAX_AVG_TIME_SEC}s per question AND accuracy
              &lt; {LOW_AND_FAST_MAX_ACCURACY}% (after at least {LOW_AND_FAST_MIN_ATTEMPTS} attempts).
            </InfoPopover>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-muted/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
                <th className="px-5 py-3">Student</th>
                <th className="px-3 py-3 text-center">Attempted</th>
                <th className="px-3 py-3 text-center">Correct</th>
                <th className="px-3 py-3">Accuracy</th>
                <th className="px-3 py-3 text-center">Avg time</th>
                <th className="px-5 py-3">Status</th>
                <th className="w-8 px-3 py-3" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {filteredStudentRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-8 text-center text-sm text-slate-gray/60"
                  >
                    {isLoading
                      ? "Loading student data..."
                      : "No students match the current filters."}
                  </td>
                </tr>
              ) : (
                filteredStudentRows.map((row) => (
                  <tr
                    key={row.studentId}
                    onClick={() =>
                      router.push(
                        `/teacher-dashboard/students/${encodeURIComponent(row.studentId)}?${standardDetailQuery}`,
                      )
                    }
                    className="cursor-pointer border-t border-border-subtle hover:bg-[var(--surface-muted)]"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <StudentAvatar label={row.label} />
                        <div>
                          <Link
                            href={`/teacher-dashboard/students/${encodeURIComponent(row.studentId)}?${standardDetailQuery}`}
                            onClick={(event) => event.stopPropagation()}
                            className="font-medium text-slate-gray hover:text-forest hover:underline"
                          >
                            {row.label}
                          </Link>
                          {row.isLowAndFast && (
                            <p className="text-xs font-medium text-rose-600 dark:text-rose-300">
                              Clicking without engaging
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center text-slate-gray">
                      {row.attempted}
                    </td>
                    <td className="px-3 py-3 text-center text-slate-gray">
                      {row.correct}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <AccuracyValue
                        value={row.accuracy}
                        hasAttempts={row.attempted > 0}
                        thresholds={data.thresholds}
                      />
                    </td>
                    <td className="px-3 py-3 text-center text-slate-gray/70">
                      {row.attempted > 0 ? `${row.averageTimeSec}s` : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <StudentStatusBadge
                        status={row.status}
                        thresholds={data.thresholds}
                      />
                    </td>
                    <td className="px-3 py-3 text-right text-slate-gray/40">
                      <ChevronRight className="ml-auto h-4 w-4" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
          </section>

          {isLoading &&
            data.byStandard.length === 0 &&
            data.byStudent.length === 0 && (
              <p className="text-sm text-slate-gray/60 mt-4">
                Loading dashboard data...
              </p>
            )}
        </>
      )}

      {section === "feedbackReports" && (
        <FeedbackReportsSection />
      )}

      {section === "feedbackSettings" && (
        <FeedbackSettingsCard />
      )}
    </main>
  );
}

const DASHBOARD_SECTION_TABS: Array<{ value: DashboardSection; label: string }> = [
  { value: "analytics", label: "Analytics" },
  { value: "feedbackReports", label: "Feedback reports" },
  { value: "feedbackSettings", label: "Feedback settings" },
];

function DashboardSectionTabs({
  value,
  onChange,
}: {
  value: DashboardSection;
  onChange: (value: DashboardSection) => void;
}) {
  return (
    <UnderlineTabs tabs={DASHBOARD_SECTION_TABS} value={value} onChange={onChange} />
  );
}

function FiltersBar(props: {
  topic: string;
  classId: string;
  studentId: string;
  range: RangeKey;
  source: SourceKey;
  topics: string[];
  classes: ClassOption[];
  students: StudentOption[];
  onTopicChange: (value: string) => void;
  onClassChange: (value: string) => void;
  onStudentChange: (value: string) => void;
  onRangeChange: (value: RangeKey) => void;
  onSourceChange: (value: SourceKey) => void;
}) {
  return (
    <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] p-4 sm:p-5 shadow-[var(--assignment-card-shadow)] mb-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <FilterSelect
          label="Topic"
          value={props.topic}
          onChange={props.onTopicChange}
          placeholder="All topics"
          options={props.topics.map((topic) => ({
            value: topic,
            label: topic,
          }))}
        />
        <FilterSelect
          label="School"
          value={props.classId}
          onChange={props.onClassChange}
          placeholder="All schools"
          options={props.classes.map((item) => ({
            value: item.id,
            label: item.label,
          }))}
        />
        <StudentSearchFilter
          value={props.studentId}
          students={props.students}
          onChange={props.onStudentChange}
        />
        <FilterSelect
          label="Date range"
          value={props.range}
          onChange={(value) => props.onRangeChange(value as RangeKey)}
          options={RANGE_OPTIONS.map((item) => ({
            value: item.value,
            label: item.label,
          }))}
        />
        <div className="text-sm text-slate-gray">
          <span className="block mb-1 text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
            Source
          </span>
          <div className="flex h-[38px] w-full items-stretch overflow-hidden rounded-lg border border-border-default bg-surface-muted p-0.5">
            <SourceToggle
              active={props.source === "all"}
              onClick={() => props.onSourceChange("all")}
            >
              All
            </SourceToggle>
            <SourceToggle
              active={props.source === "assigned"}
              onClick={() => props.onSourceChange("assigned")}
            >
              Assigned
            </SourceToggle>
            <SourceToggle
              active={props.source === "self"}
              onClick={() => props.onSourceChange("self")}
            >
              Self
            </SourceToggle>
          </div>
        </div>
      </div>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm text-slate-gray">
      <span className="block mb-1 text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 px-3 py-2 text-sm text-slate-gray"
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StudentSearchFilter({
  value,
  students,
  onChange,
}: {
  value: string;
  students: StudentOption[];
  onChange: (value: string) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const skipNextEmptySyncRef = useRef(false);
  const listboxId = useId();
  const selectedStudent = students.find((student) => student.id === value);
  const [query, setQuery] = useState(selectedStudent?.label ?? "");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (selectedStudent?.label) {
      skipNextEmptySyncRef.current = false;
      setQuery(selectedStudent.label);
      return;
    }
    if (skipNextEmptySyncRef.current) {
      skipNextEmptySyncRef.current = false;
      return;
    }
    setQuery("");
  }, [selectedStudent?.label, value]);

  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (
        event.target instanceof Node &&
        wrapperRef.current.contains(event.target)
      ) {
        return;
      }
      setIsOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isOpen]);

  const normalizedQuery = query.trim().toLowerCase();
  const matches = students
    .filter((student) =>
      normalizedQuery
        ? student.label.toLowerCase().includes(normalizedQuery)
        : true,
    )
    .slice(0, 8);

  function selectStudent(student: StudentOption) {
    setQuery(student.label);
    onChange(student.id);
    setIsOpen(false);
  }

  function clearStudent() {
    setQuery("");
    onChange("");
    setIsOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative text-sm text-slate-gray">
      <span className="block mb-1 text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
        Student
      </span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-gray/40" />
        <input
          type="text"
          value={query}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setIsOpen(true);
            if (value && next !== selectedStudent?.label) {
              skipNextEmptySyncRef.current = true;
              onChange("");
            } else if (next === "") {
              onChange("");
            }
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setIsOpen(false);
            } else if (event.key === "Enter" && matches[0]) {
              event.preventDefault();
              selectStudent(matches[0]);
            }
          }}
          placeholder="Search students"
          className="h-[38px] w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 px-9 py-2 text-sm text-slate-gray placeholder:text-slate-gray/40"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
        />
        {value && (
          <Button
            variant="icon"
            onClick={clearStudent}
            className="absolute right-2 top-1/2 -translate-y-1/2"
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Clear student</span>
          </Button>
        )}
      </div>
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border-default bg-surface py-1 shadow-lg"
        >
          <button
            type="button"
            role="option"
            aria-selected={!value}
            onMouseDown={(event) => event.preventDefault()}
            onClick={clearStudent}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-gray hover:bg-[var(--surface-muted)]"
          >
            <span>All students</span>
            {!value && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-forest">
                Current
              </span>
            )}
          </button>
          {matches.map((student) => (
            <button
              key={student.id}
              type="button"
              role="option"
              aria-selected={student.id === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectStudent(student)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-slate-gray hover:bg-[var(--surface-muted)]"
            >
              <span className="truncate">{student.label}</span>
              {student.id === value && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-forest">
                  Current
                </span>
              )}
            </button>
          ))}
          {matches.length === 0 && (
            <p className="px-3 py-2 text-sm text-slate-gray/60">
              No students found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SourceToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors ${
        active
          ? "bg-surface text-forest shadow"
          : "text-slate-gray/70 hover:text-slate-gray"
      }`}
    >
      {children}
    </button>
  );
}

function ModeTabs({
  value,
  onChange,
  thresholds,
  defaults,
  thresholdsAreCustom,
  onThresholdsChange,
}: {
  value: ModeKey;
  onChange: (value: ModeKey) => void;
  thresholds: PerformanceThresholds;
  defaults: PerformanceThresholds;
  thresholdsAreCustom: boolean;
  onThresholdsChange: () => void;
}) {
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  return (
    <>
      <UnderlineTabs
        tabs={MODE_TABS}
        value={value}
        onChange={onChange}
        trailing={
          <>
            <PerformanceThresholdsCard
              thresholds={thresholds}
              defaults={defaults}
              isCustom={thresholdsAreCustom}
              onChange={onThresholdsChange}
            />
            <Button variant="outline" onClick={() => setIsGuideOpen(true)}>
              <Info className="h-4 w-4" />
              About modes
            </Button>
          </>
        }
      />

      {isGuideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-6 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mode-guide-title"
        >
          <div className="w-full max-w-xl rounded-2xl bg-surface shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
              <div>
                <h2
                  id="mode-guide-title"
                  className="flex items-center gap-2 text-base font-semibold text-slate-gray"
                >
                  <Info className="h-4 w-4 text-[var(--assignment-completed)]" />
                  Mode guide
                </h2>
              </div>
              <Button variant="icon" onClick={() => setIsGuideOpen(false)}>
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
            <div className="px-5 py-4">
              {LEARNING_MODE_TABS.map((tab) => (
                <div
                  key={tab.value}
                  className="border-l-2 border-[var(--assignment-completed)] py-3 pl-4 first:pt-0 last:pb-0 [&+&]:mt-3 [&+&]:border-t [&+&]:border-t-border-subtle"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-gray">
                      {tab.label}
                    </p>
                    {tab.value === value && (
                      <span className="rounded-full bg-[var(--assignment-calendar-nav-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--assignment-completed)]">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-gray/70">
                    {tab.helper}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t border-border-subtle px-5 py-4">
              <Button onClick={() => setIsGuideOpen(false)}>Done</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function KpiCard({
  label,
  value,
  helper,
  accentClass,
  info,
}: {
  label: string;
  value: string;
  helper: string;
  accentClass: string;
  info?: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] p-4 sm:p-6 shadow-[var(--assignment-card-shadow)]">
      <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
        {label}
        {info && (
          <InfoPopover label={`How is ${label} computed?`} align="start">
            {info}
          </InfoPopover>
        )}
      </div>
      <p className={`text-3xl font-bold ${accentClass}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-gray/60">{helper}</p>
    </article>
  );
}

function ModeAccuracyCard({
  summary,
  thresholds,
}: {
  summary: DashboardSummary;
  thresholds: PerformanceThresholds;
}) {
  const byMode = summary.byMode;
  const toneClass = (accuracy: number, hasAttempts: boolean) =>
    hasAttempts ? accuracyToneClass(accuracy, thresholds) : "text-slate-gray/40";
  return (
    <article className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] p-4 sm:p-6 shadow-[var(--assignment-card-shadow)]">
      <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
        Accuracy by Mode
        <InfoPopover
          label="How is per-mode accuracy computed?"
          align="start"
          width="wide"
        >
          For each mode,{" "}
          <span className="font-mono">correct ÷ attempted × 100</span>{" "}
          across attempts in that mode. Colors mirror the standard bands (
          {thresholds.basicMin}% /{" "}
          {thresholds.proficientMin}% /{" "}
          {thresholds.advancedMin}%).
        </InfoPopover>
      </div>
      <ul className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-3 gap-y-2">
        {ATTEMPT_MODES.map((m) => {
          const metrics = byMode?.[m];
          const hasAttempts = (metrics?.attempted ?? 0) > 0;
          const studentsAttempted = metrics?.studentsAttempted ?? 0;
          return (
            <li key={m} className="contents">
              <span className="text-xs font-medium text-slate-gray/80">
                {MODE_LABELS[m]}
              </span>
              <span
                className={`text-right text-base font-bold ${toneClass(metrics?.accuracy ?? 0, hasAttempts)}`}
              >
                {hasAttempts ? `${metrics?.accuracy ?? 0}%` : "—"}
              </span>
              <span className="whitespace-nowrap text-right text-[10px] text-slate-gray/60">
                {hasAttempts
                  ? `${metrics?.correct ?? 0}/${metrics?.attempted ?? 0} answers`
                  : "no attempts"}
              </span>
              <span className="whitespace-nowrap text-right text-[10px] text-slate-gray/50">
                {hasAttempts
                  ? `${studentsAttempted} ${studentsAttempted === 1 ? "student" : "students"}`
                  : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function StudentBreakdownCard({
  summary,
  thresholds,
}: {
  summary: DashboardSummary;
  thresholds: PerformanceThresholds;
}) {
  const { breakdown, studentsTotal } = summary;
  const segments = [
    {
      label: BAND_LABELS.advanced,
      value: breakdown.advanced,
      color: BAND_TONES.advanced.swatch,
    },
    {
      label: BAND_LABELS.proficient,
      value: breakdown.proficient,
      color: BAND_TONES.proficient.swatch,
    },
    {
      label: BAND_LABELS.basic,
      value: breakdown.basic,
      color: BAND_TONES.basic.swatch,
    },
    {
      label: BAND_LABELS.below_basic,
      value: breakdown.belowBasic,
      color: BAND_TONES.below_basic.swatch,
    },
    {
      label: BAND_LABELS.not_started,
      value: breakdown.notStarted,
      color: BAND_TONES.not_started.swatch,
    },
  ];
  return (
    <article className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] p-4 sm:p-6 shadow-[var(--assignment-card-shadow)]">
      <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
        Student Breakdown
        <InfoPopover
          label="How are student bands computed?"
          align="end"
          width="wide"
        >
          <BandLegend bands={describeStudentBands(thresholds)} />
        </InfoPopover>
      </div>
      <div className="flex items-center gap-3">
        <DonutChart segments={segments} total={studentsTotal} />
        <ul className="flex-1 space-y-1 text-xs text-slate-gray">
          {segments.map((segment) => (
            <li key={segment.label} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: segment.color }}
              />
              <span className="flex-1 text-slate-gray/80">{segment.label}</span>
              <span className="font-semibold text-slate-gray">
                {segment.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function DonutChart({
  segments,
  total,
}: {
  segments: { label: string; value: number; color: string }[];
  total: number;
}) {
  const size = 84;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const effectiveTotal = segments.reduce((sum, seg) => sum + seg.value, 0);
  const denom = effectiveTotal > 0 ? effectiveTotal : 1;

  let cumulative = 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--border-subtle)"
          strokeWidth={stroke}
          fill="none"
        />
        {effectiveTotal > 0 &&
          segments.map((segment, index) => {
            if (segment.value === 0) return null;
            const fraction = segment.value / denom;
            const dash = fraction * circumference;
            const offset = (cumulative / denom) * circumference;
            cumulative += segment.value;
            return (
              <circle
                key={`${segment.label}-${index}`}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={segment.color}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                strokeLinecap="butt"
              />
            );
          })}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-slate-gray">{total}</span>
      </div>
    </div>
  );
}

function StatusFilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; count?: number }[];
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 min-w-44 rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 px-3 text-sm font-medium text-slate-gray transition-colors"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {typeof option.count === "number"
              ? `${option.label} (${option.count})`
              : option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function AccuracyValue({
  value,
  hasAttempts,
  thresholds,
}: {
  value: number;
  hasAttempts: boolean;
  thresholds: PerformanceThresholds;
}) {
  if (!hasAttempts) return <span className="text-slate-gray/40">—</span>;
  const tone = accuracyToneClass(value, thresholds);
  return <span className={`font-semibold ${tone}`}>{value}%</span>;
}

function ModeAccuracyCell({
  metrics,
  thresholds,
}: {
  metrics: ModeMetrics | undefined;
  thresholds: PerformanceThresholds;
}) {
  if (!metrics || metrics.attempted === 0) {
    return (
      <div className="flex min-w-24 flex-col items-center text-slate-gray/40">
        <span className="text-sm">—</span>
        <span className="whitespace-nowrap text-[10px]">no attempts</span>
      </div>
    );
  }
  const tone = accuracyToneClass(metrics.accuracy, thresholds);
  return (
    <div className="flex min-w-24 flex-col items-center">
      <span className={`text-sm font-semibold ${tone}`}>
        {metrics.accuracy}%
      </span>
      <span className="whitespace-nowrap text-[10px] text-slate-gray/60">
        {metrics.correct}/{metrics.attempted} answers
      </span>
      <span className="whitespace-nowrap text-[10px] text-slate-gray/50">
        {metrics.studentsAttempted}{" "}
        {metrics.studentsAttempted === 1 ? "student" : "students"}
      </span>
    </div>
  );
}

function StatusBadgeBase({
  band,
  icon,
}: {
  band: BandDescriptor;
  icon?: ReactNode;
}) {
  const tone = BAND_TONES[band.key];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone.badge}`}
    >
      {icon}
      {band.label}
    </span>
  );
}

function StandardStatusBadge({
  status,
  thresholds,
}: {
  status: StandardRow["status"];
  thresholds: PerformanceThresholds;
}) {
  const band = findStandardBand(status, thresholds);
  return (
    <StatusBadgeBase
      band={band}
      icon={
        status === "below_basic" ? (
          <BookOpen className="w-3 h-3 flex-shrink-0" />
        ) : undefined
      }
    />
  );
}

function StudentStatusBadge({
  status,
  thresholds,
}: {
  status: StudentRow["status"];
  thresholds: PerformanceThresholds;
}) {
  const band = findStudentBand(status, thresholds);
  return (
    <StatusBadgeBase band={band} />
  );
}

function BandLegend({ bands }: { bands: BandDescriptor[] }) {
  const visibleBands = bands.filter((band) => band.key !== "not_started");
  return (
    <div>
      <p>Each row is classified by its accuracy:</p>
      <ul className="mt-2 space-y-1.5">
        {visibleBands.map((band) => (
          <li key={band.key} className="flex items-start gap-2">
            <span
              className="mt-0.5 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-sm"
              style={{ backgroundColor: BAND_TONES[band.key].swatch }}
            />
            <span>
              <span className="font-semibold text-slate-gray">
                {band.label}
              </span>{" "}
              <span className="font-mono text-slate-gray/70">
                ({band.range})
              </span>
              <br />
              <span className="text-slate-gray/80">{band.meaning}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (remainder === 0) return `${minutes}m`;
  return `${minutes}m ${remainder}s`;
}

function avgTimeHelper(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "no attempts yet";
  if (seconds < 20) return "possibly rushing";
  if (seconds > 180) return "taking their time";
  return "engaged, not rushing";
}

function activeStudentsHelper(
  summary: DashboardSummary,
  mode: ModeKey,
): string {
  const scope = mode === "compare" ? "any selected mode" : `${mode} mode`;
  return `${summary.studentsAttempted} of ${summary.studentsTotal} students answered in ${scope}`;
}
