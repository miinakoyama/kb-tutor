"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Download,
  Info,
  Timer,
  TrendingUp,
  Users,
} from "lucide-react";
import { StudentAvatar } from "@/components/StudentAvatar";
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
type RangeKey = "7d" | "30d" | "all";
type ModeKey = "compare" | "practice" | "exam" | "review";
type AttemptModeKey = "practice" | "exam" | "review";
type SourceKey = "assigned" | "self" | "all";
type StudentStatusFilter = "all" | "struggling" | "watch" | "on_track" | "low_and_fast";
type StandardStatusFilter = "all" | "needs_review" | "watch" | "on_track";

interface ClassOption {
  id: string;
  label: string;
}

interface StudentOption {
  id: string;
  label: string;
  classId: string | null;
}

interface DashboardPayload {
  classes: ClassOption[];
  students: StudentOption[];
  topics: string[];
  summary: DashboardSummary;
  byStandard: StandardRow[];
  byStudent: StudentRow[];
  lowAndFastCount: number;
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
    breakdown: { onTrack: 0, watch: 0, struggling: 0, notStarted: 0 },
  },
  byStandard: [],
  byStudent: [],
  lowAndFastCount: 0,
};

export default function TeacherDashboardPage() {
  return <TeacherDashboardContent />;
}

function TeacherDashboardContent() {
  const [topic, setTopic] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [range, setRange] = useState<RangeKey>("30d");
  const [mode, setMode] = useState<ModeKey>("compare");
  const [source, setSource] = useState<SourceKey>("all");
  const [standardFilter, setStandardFilter] = useState<StandardStatusFilter>("all");
  const [studentFilter, setStudentFilter] = useState<StudentStatusFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<DashboardPayload>(EMPTY_PAYLOAD);

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
  }, [topic, classId, studentId, range, mode, source]);

  const filteredStudents = useMemo(() => {
    if (!classId) return data.students;
    return data.students.filter((student) => student.classId === classId);
  }, [classId, data.students]);

  const filteredStandards = useMemo(() => {
    if (standardFilter === "all") return data.byStandard;
    return data.byStandard.filter((row) => row.status === standardFilter);
  }, [standardFilter, data.byStandard]);

  const filteredStudentRows = useMemo(() => {
    if (studentFilter === "all") return data.byStudent;
    if (studentFilter === "low_and_fast") {
      return data.byStudent.filter((row) => row.isLowAndFast);
    }
    return data.byStudent.filter((row) => row.status === studentFilter);
  }, [studentFilter, data.byStudent]);

  const modeHelper = MODE_TABS.find((tab) => tab.value === mode)?.helper ?? "";

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <section className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[#14532d]">
          Teacher Dashboard
        </h1>
        <p className="text-sm text-slate-gray/70 mt-1">
          Identify which standards need re-teaching and which students need a
          closer look. Per-assignment completion is on{" "}
          <Link
            href="/assignments/manage?tab=progress"
            className="font-medium text-[#16a34a] hover:underline"
          >
            Assignment management → Progress
          </Link>
          .
        </p>
      </section>

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

      <ModeTabs value={mode} onChange={setMode} />

      <div className="mb-6 flex items-start gap-2 rounded-xl border border-[#16a34a]/25 bg-[#16a34a]/5 px-4 py-3 text-sm text-[#166534]">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>{modeHelper}</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <KpiCard
          label="Active Students"
          value={`${data.summary.completionRate}%`}
          helper={activeStudentsHelper(data.summary, mode)}
          icon={CheckCircle2}
          accentClass="text-[#16a34a]"
          bgClass="bg-[#16a34a]/10"
        />
        {mode === "compare" ? (
          <ModeAccuracyCard summary={data.summary} />
        ) : (
          <KpiCard
            label="Overall Accuracy"
            value={`${data.summary.overallAccuracy}%`}
            helper={
              data.summary.totalAnswered > 0
                ? `${data.summary.totalCorrect.toLocaleString()} correct of ${data.summary.totalAnswered.toLocaleString()} answered`
                : "no attempts yet"
            }
            icon={TrendingUp}
            accentClass="text-[#1d4ed8]"
            bgClass="bg-[#2563eb]/10"
          />
        )}
        <KpiCard
          label="Avg Time / Question"
          value={formatDuration(data.summary.avgTimeSec)}
          helper={avgTimeHelper(data.summary.avgTimeSec)}
          icon={Timer}
          accentClass="text-[#b45309]"
          bgClass="bg-[#f59e0b]/10"
        />
        <StudentBreakdownCard summary={data.summary} />
      </section>

      <section className="rounded-2xl border border-[#16a34a]/25 bg-white shadow-sm mb-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-gray">
              Performance by standard
            </h2>
            <p className="text-xs text-slate-gray/60">
              Tap a status pill to focus on what needs re-teaching.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip
              label="All"
              active={standardFilter === "all"}
              onClick={() => setStandardFilter("all")}
            />
            <StatusChip
              label="Needs review"
              tone="rose"
              active={standardFilter === "needs_review"}
              onClick={() => setStandardFilter("needs_review")}
              count={
                data.byStandard.filter((row) => row.status === "needs_review")
                  .length
              }
            />
            <StatusChip
              label="Watch"
              tone="amber"
              active={standardFilter === "watch"}
              onClick={() => setStandardFilter("watch")}
              count={
                data.byStandard.filter((row) => row.status === "watch").length
              }
            />
            <StatusChip
              label="On track"
              tone="emerald"
              active={standardFilter === "on_track"}
              onClick={() => setStandardFilter("on_track")}
              count={
                data.byStandard.filter((row) => row.status === "on_track").length
              }
            />
            <button
              onClick={() => downloadStandardMetricsCsv(filteredStandards)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#15803d] transition-colors"
            >
              <Download className="w-4 h-4" />
              Download CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
                <th className="px-5 py-3">Standard</th>
                <th className="px-3 py-3 text-right">Attempted</th>
                <th className="px-3 py-3 text-right">Correct</th>
                {mode === "compare" ? (
                  <>
                    <th className="px-3 py-3 text-center">Practice</th>
                    <th className="px-3 py-3 text-center">Exam</th>
                    <th className="px-3 py-3 text-center">Review</th>
                  </>
                ) : (
                  <th className="px-3 py-3">Accuracy</th>
                )}
                <th className="px-3 py-3">Avg time</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredStandards.length === 0 ? (
                <tr>
                  <td
                    colSpan={mode === "compare" ? 8 : 6}
                    className="px-5 py-8 text-center text-sm text-slate-gray/60"
                  >
                    {isLoading
                      ? "Loading performance data..."
                      : "No data for the current filters."}
                  </td>
                </tr>
              ) : (
                filteredStandards.map((row) => (
                  <tr
                    key={row.standardId}
                    className="border-t border-slate-100 hover:bg-slate-50/40"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={buildStandardDrillDownHref(row.standardId, {
                          range,
                          mode,
                          source,
                          classId,
                          topic,
                        })}
                        className="block max-w-md font-medium text-[#166534] hover:underline"
                      >
                        {row.standardId}
                      </Link>
                      <p className="text-xs text-slate-gray/60 line-clamp-2 max-w-md">
                        {row.standardLabel}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-right text-slate-gray">
                      {row.attempted}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-gray">
                      {row.correct}
                    </td>
                    {mode === "compare" ? (
                      <>
                        <td className="px-3 py-3">
                          <ModeAccuracyCell metrics={row.byMode?.practice} />
                        </td>
                        <td className="px-3 py-3">
                          <ModeAccuracyCell metrics={row.byMode?.exam} />
                        </td>
                        <td className="px-3 py-3">
                          <ModeAccuracyCell metrics={row.byMode?.review} />
                        </td>
                      </>
                    ) : (
                      <td className="px-3 py-3">
                        <AccuracyBar value={row.accuracy} status={row.status} />
                      </td>
                    )}
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 text-slate-gray/70">
                        <Timer className="w-3.5 h-3.5 text-slate-gray/50" />
                        {row.averageTimeSec}s
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <StandardStatusBadge status={row.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-[#16a34a]/25 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-gray">
              {studentId ? "Student detail" : "All students"}
            </h2>
            {data.lowAndFastCount > 0 && (
              <button
                onClick={() => setStudentFilter("low_and_fast")}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                {data.lowAndFastCount}{" "}
                {data.lowAndFastCount === 1 ? "student" : "students"} clicking
                without engaging
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip
              label="All"
              active={studentFilter === "all"}
              onClick={() => setStudentFilter("all")}
            />
            <StatusChip
              label="Low + fast"
              tone="rose"
              active={studentFilter === "low_and_fast"}
              onClick={() => setStudentFilter("low_and_fast")}
              count={data.lowAndFastCount}
            />
            <StatusChip
              label="Struggling"
              tone="rose"
              active={studentFilter === "struggling"}
              onClick={() => setStudentFilter("struggling")}
              count={data.summary.breakdown.struggling}
            />
            <StatusChip
              label="Watch"
              tone="amber"
              active={studentFilter === "watch"}
              onClick={() => setStudentFilter("watch")}
              count={data.summary.breakdown.watch}
            />
            <StatusChip
              label="On track"
              tone="emerald"
              active={studentFilter === "on_track"}
              onClick={() => setStudentFilter("on_track")}
              count={data.summary.breakdown.onTrack}
            />
            <button
              onClick={() => downloadStudentMetricsCsv(filteredStudentRows)}
              className="inline-flex items-center gap-2 rounded-lg border border-[#16a34a] px-3 py-1.5 text-sm font-medium text-[#166534] hover:bg-[#16a34a]/10 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download CSV
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
                <th className="px-5 py-3">Student</th>
                <th className="px-3 py-3 text-right">Attempted</th>
                <th className="px-3 py-3 text-right">Correct</th>
                <th className="px-3 py-3">Accuracy</th>
                <th className="px-3 py-3">Avg time</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudentRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
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
                    className="border-t border-slate-100 hover:bg-slate-50/40"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <StudentAvatar label={row.label} />
                        <div>
                          <Link
                            href={buildStudentProfileHref(row.studentId, {
                              range,
                              mode,
                              source,
                              classId,
                              topic,
                            })}
                            className="font-medium text-[#166534] hover:underline"
                          >
                            {row.label}
                          </Link>
                          {row.isLowAndFast && (
                            <p className="text-xs font-medium text-rose-600">
                              Clicking without engaging
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-slate-gray">
                      {row.attempted}
                    </td>
                    <td className="px-3 py-3 text-right text-slate-gray">
                      {row.correct}
                    </td>
                    <td className="px-3 py-3">
                      <AccuracyValue
                        value={row.accuracy}
                        hasAttempts={row.attempted > 0}
                      />
                    </td>
                    <td className="px-3 py-3 text-slate-gray/70">
                      {row.attempted > 0 ? `${row.averageTimeSec}s` : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <StudentStatusBadge status={row.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isLoading && data.byStandard.length === 0 && data.byStudent.length === 0 && (
        <p className="text-sm text-slate-gray/60 mt-4">
          Loading dashboard data...
        </p>
      )}
    </main>
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
    <section className="rounded-2xl border border-[#16a34a]/25 bg-white p-4 sm:p-5 shadow-sm mb-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <FilterSelect
          label="Topic"
          value={props.topic}
          onChange={props.onTopicChange}
          placeholder="All topics"
          options={props.topics.map((topic) => ({ value: topic, label: topic }))}
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
        <FilterSelect
          label="Student"
          value={props.studentId}
          onChange={props.onStudentChange}
          placeholder="All students"
          options={props.students.map((item) => ({
            value: item.id,
            label: item.label,
          }))}
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
          <div className="flex h-[38px] w-full items-stretch overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-0.5">
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
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-gray focus:border-[#16a34a] focus:outline-none focus:ring-2 focus:ring-[#16a34a]/20"
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
      className={`flex flex-1 items-center justify-center whitespace-nowrap rounded-md px-2 text-xs font-semibold transition-colors ${
        active
          ? "bg-white text-[#166534] shadow"
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
}: {
  value: ModeKey;
  onChange: (value: ModeKey) => void;
}) {
  return (
    <div className="mb-3 flex items-center gap-4 border-b border-slate-200">
      {MODE_TABS.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={`-mb-px border-b-2 px-1.5 pb-2.5 pt-1 text-sm font-semibold transition-colors ${
              active
                ? "border-[#16a34a] text-[#14532d]"
                : "border-transparent text-slate-gray/60 hover:text-slate-gray"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function KpiCard({
  label,
  value,
  helper,
  icon: Icon,
  accentClass,
  bgClass,
}: {
  label: string;
  value: string;
  helper: string;
  icon: ComponentType<{ className?: string }>;
  accentClass: string;
  bgClass: string;
}) {
  return (
    <article className="rounded-2xl border border-[#16a34a]/20 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
          {label}
        </p>
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${bgClass}`}
        >
          <Icon className={`h-4 w-4 ${accentClass}`} />
        </span>
      </div>
      <p className={`text-3xl font-bold ${accentClass}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-gray/60">{helper}</p>
    </article>
  );
}

function ModeAccuracyCard({ summary }: { summary: DashboardSummary }) {
  const byMode = summary.byMode;
  const toneClass = (accuracy: number, hasAttempts: boolean) => {
    if (!hasAttempts) return "text-slate-gray/40";
    if (accuracy >= 70) return "text-emerald-700";
    if (accuracy >= 55) return "text-amber-700";
    return "text-rose-700";
  };
  return (
    <article className="rounded-2xl border border-[#16a34a]/20 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
          Accuracy by Mode
        </p>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#2563eb]/10">
          <TrendingUp className="h-4 w-4 text-[#1d4ed8]" />
        </span>
      </div>
      <ul className="space-y-2">
        {ATTEMPT_MODES.map((m) => {
          const metrics = byMode?.[m];
          const hasAttempts = (metrics?.attempted ?? 0) > 0;
          return (
            <li key={m} className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-slate-gray/80">
                {MODE_LABELS[m]}
              </span>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-base font-bold ${toneClass(metrics?.accuracy ?? 0, hasAttempts)}`}
                >
                  {hasAttempts ? `${metrics?.accuracy ?? 0}%` : "—"}
                </span>
                <span className="text-[10px] text-slate-gray/60">
                  {hasAttempts
                    ? `${metrics?.correct ?? 0}/${metrics?.attempted ?? 0} answers`
                    : "no attempts"}
                </span>
              </div>
              {hasAttempts && (
                <span className="text-[10px] text-slate-gray/50">
                  {metrics?.studentsAttempted ?? 0}{" "}
                  {(metrics?.studentsAttempted ?? 0) === 1
                    ? "student"
                    : "students"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function StudentBreakdownCard({ summary }: { summary: DashboardSummary }) {
  const { breakdown, studentsTotal } = summary;
  const segments = [
    { label: "On track", value: breakdown.onTrack, color: "#16a34a" },
    { label: "Watch", value: breakdown.watch, color: "#f59e0b" },
    { label: "Struggling", value: breakdown.struggling, color: "#f43f5e" },
    { label: "Not started", value: breakdown.notStarted, color: "#cbd5e1" },
  ];
  return (
    <article className="rounded-2xl border border-[#16a34a]/20 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
          Student Breakdown
        </p>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#16a34a]/10">
          <Users className="h-4 w-4 text-[#16a34a]" />
        </span>
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
          stroke="#f1f5f9"
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

function StatusChip({
  label,
  active,
  onClick,
  tone = "slate",
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: "slate" | "emerald" | "amber" | "rose";
  count?: number;
}) {
  const toneClass: Record<string, string> = {
    slate:
      "border-slate-300 text-slate-gray bg-white hover:bg-slate-100",
    emerald:
      "border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50",
    amber: "border-amber-200 text-amber-700 bg-white hover:bg-amber-50",
    rose: "border-rose-200 text-rose-700 bg-white hover:bg-rose-50",
  };
  const activeClass: Record<string, string> = {
    slate: "bg-slate-900 text-white border-slate-900",
    emerald: "bg-emerald-600 text-white border-emerald-600",
    amber: "bg-amber-500 text-white border-amber-500",
    rose: "bg-rose-600 text-white border-rose-600",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16a34a]/40 focus-visible:ring-offset-1 ${
        active ? activeClass[tone] : toneClass[tone]
      }`}
    >
      {label}
      {typeof count === "number" && (
        <span
          className={`rounded-full px-1.5 text-[10px] ${
            active ? "bg-white/20" : "bg-slate-100"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function AccuracyBar({
  value,
  status,
}: {
  value: number;
  status: StandardRow["status"];
}) {
  const colorMap: Record<StandardRow["status"], string> = {
    on_track: "bg-emerald-500",
    watch: "bg-amber-500",
    needs_review: "bg-rose-500",
    not_started: "bg-slate-300",
  };
  const textMap: Record<StandardRow["status"], string> = {
    on_track: "text-emerald-700",
    watch: "text-amber-700",
    needs_review: "text-rose-700",
    not_started: "text-slate-400",
  };
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <div className="h-1.5 flex-1 rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${colorMap[status]}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className={`text-sm font-semibold ${textMap[status]}`}>
        {status === "not_started" ? "—" : `${value}%`}
      </span>
    </div>
  );
}

function AccuracyValue({
  value,
  hasAttempts,
}: {
  value: number;
  hasAttempts: boolean;
}) {
  if (!hasAttempts) return <span className="text-slate-gray/40">—</span>;
  const tone =
    value >= 70
      ? "text-emerald-700"
      : value >= 50
        ? "text-amber-700"
        : "text-rose-700";
  return <span className={`font-semibold ${tone}`}>{value}%</span>;
}

function ModeAccuracyCell({ metrics }: { metrics: ModeMetrics | undefined }) {
  if (!metrics || metrics.attempted === 0) {
    return (
      <div className="flex flex-col items-center text-slate-gray/40">
        <span className="text-sm">—</span>
        <span className="text-[10px]">no attempts</span>
      </div>
    );
  }
  const tone =
    metrics.accuracy >= 70
      ? "text-emerald-700"
      : metrics.accuracy >= 55
        ? "text-amber-700"
        : "text-rose-700";
  return (
    <div className="flex flex-col items-center">
      <span className={`text-sm font-semibold ${tone}`}>
        {metrics.accuracy}%
      </span>
      <span className="text-[10px] text-slate-gray/60">
        {metrics.correct}/{metrics.attempted} answers
      </span>
      <span className="text-[10px] text-slate-gray/50">
        {metrics.studentsAttempted}{" "}
        {metrics.studentsAttempted === 1 ? "student" : "students"}
      </span>
    </div>
  );
}

function StandardStatusBadge({ status }: { status: StandardRow["status"] }) {
  const label: Record<StandardRow["status"], string> = {
    on_track: "On track",
    watch: "Watch",
    needs_review: "Needs review",
    not_started: "Not started",
  };
  const tone: Record<StandardRow["status"], string> = {
    on_track: "bg-emerald-50 text-emerald-700 border-emerald-200",
    watch: "bg-amber-50 text-amber-700 border-amber-200",
    needs_review: "bg-rose-50 text-rose-700 border-rose-200",
    not_started: "bg-slate-50 text-slate-500 border-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone[status]}`}
    >
      {status === "needs_review" && <BookOpen className="w-3 h-3 flex-shrink-0" />}
      {label[status]}
    </span>
  );
}

function StudentStatusBadge({ status }: { status: StudentRow["status"] }) {
  const label: Record<StudentRow["status"], string> = {
    on_track: "On track",
    watch: "Watch",
    struggling: "Struggling",
    not_started: "Not started",
  };
  const tone: Record<StudentRow["status"], string> = {
    on_track: "bg-emerald-50 text-emerald-700 border-emerald-200",
    watch: "bg-amber-50 text-amber-700 border-amber-200",
    struggling: "bg-rose-50 text-rose-700 border-rose-200",
    not_started: "bg-slate-50 text-slate-500 border-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone[status]}`}
    >
      {label[status]}
    </span>
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

function activeStudentsHelper(summary: DashboardSummary, mode: ModeKey): string {
  const scope = mode === "compare" ? "any selected mode" : `${mode} mode`;
  return `${summary.studentsAttempted} of ${summary.studentsTotal} students answered in ${scope}`;
}

function buildStandardDrillDownHref(
  standardId: string,
  filters: {
    range: RangeKey;
    mode: ModeKey;
    source: SourceKey;
    classId: string;
    topic: string;
  },
): string {
  const params = new URLSearchParams();
  if (filters.range !== "30d") params.set("range", filters.range);
  if (filters.mode !== "compare") params.set("mode", filters.mode);
  if (filters.source !== "all") params.set("source", filters.source);
  if (filters.classId) params.set("classId", filters.classId);
  if (filters.topic) params.set("topic", filters.topic);
  const qs = params.toString();
  const safe = encodeURIComponent(standardId);
  return qs ? `/teacher-dashboard/standards/${safe}?${qs}` : `/teacher-dashboard/standards/${safe}`;
}

function buildStudentProfileHref(
  studentId: string,
  filters: {
    range: RangeKey;
    mode: ModeKey;
    source: SourceKey;
    classId: string;
    topic: string;
  },
): string {
  const params = new URLSearchParams();
  if (filters.range !== "30d") params.set("range", filters.range);
  if (filters.mode !== "compare") params.set("mode", filters.mode);
  if (filters.source !== "all") params.set("source", filters.source);
  if (filters.classId) params.set("classId", filters.classId);
  if (filters.topic) params.set("topic", filters.topic);
  const qs = params.toString();
  const safe = encodeURIComponent(studentId);
  return qs ? `/teacher-dashboard/students/${safe}?${qs}` : `/teacher-dashboard/students/${safe}`;
}
