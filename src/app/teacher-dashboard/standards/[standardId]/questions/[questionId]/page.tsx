"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Pencil, Search, Timer } from "lucide-react";
import { LatexText } from "@/components/shared/LatexText";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import type {
  QuestionPreview,
  QuestionType,
} from "@/lib/analytics/question-preview";
import type { ConfidenceQuadrantPercents } from "@/lib/analytics/confidence";
import type { GradedFeedback, PartLabel } from "@/types/short-answer";
import { formatShortAnswerAttemptTimestamp } from "@/lib/analytics/short-answer-attempt-order";
import { badgeAmber, badgeRose } from "@/lib/ui/status-badge-styles";
import { buttonClassNames } from "@/components/ui/Button";
import { TeacherAttemptFeedback } from "@/components/short-answer/TeacherAttemptFeedback";

interface QuestionDetailChoice {
  id: string;
  text: string;
  isCorrect: boolean;
  count: number;
  percent: number;
}

interface ShortAnswerResponseDetail {
  attemptId: string;
  studentId: string;
  studentLabel: string;
  partLabel: PartLabel;
  attemptNumber: number;
  responseText: string;
  score: number;
  maxScore: number;
  isCorrect: boolean;
  feedback: GradedFeedback | null;
  answeredAt: string;
}

interface QuestionDetailResponse {
  standard: { id: string; label: string } | null;
  question: {
    questionId: string;
    setId: string | null;
    questionType: QuestionType | null;
    preview: QuestionPreview | null;
  };
  summary: {
    attempted: number;
    correct: number;
    accuracy: number;
    averageTimeSec: number;
  };
  choices: QuestionDetailChoice[];
  shortAnswerResponses: ShortAnswerResponseDetail[];
  totalStudents: number;
  confidence: ConfidenceQuadrantPercents;
}

const EMPTY_CONFIDENCE: ConfidenceQuadrantPercents = {
  mastery: 0,
  misconception: 0,
  fragile: 0,
  expected: 0,
  total: 0,
};

const EMPTY_DATA: QuestionDetailResponse = {
  standard: null,
  question: { questionId: "", setId: null, questionType: null, preview: null },
  summary: { attempted: 0, correct: 0, accuracy: 0, averageTimeSec: 0 },
  choices: [],
  shortAnswerResponses: [],
  totalStudents: 0,
  confidence: EMPTY_CONFIDENCE,
};

const FORWARDED_FILTER_KEYS = ["range", "mode", "source", "classId", "studentId"];

export default function QuestionDetailPage() {
  const params = useParams<{ standardId: string; questionId: string }>();
  const searchParams = useSearchParams();
  const standardId = decodeURIComponent(params.standardId);
  const questionId = decodeURIComponent(params.questionId);
  const hasSetId = searchParams.has("setId");
  const setId = searchParams.get("setId");

  const [data, setData] = useState<QuestionDetailResponse>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);

  const forwardedQuery = new URLSearchParams();
  for (const key of FORWARDED_FILTER_KEYS) {
    const value = searchParams.get(key);
    if (value) forwardedQuery.set(key, value);
  }
  const qIndex = searchParams.get("qIndex");
  const qTotal = searchParams.get("qTotal");

  useEffect(() => {
    let isCurrent = true;
    const controller = new AbortController();

    const load = async () => {
      setIsLoading(true);
      try {
        const apiQuery = new URLSearchParams(forwardedQuery);
        if (hasSetId) apiQuery.set("setId", setId ?? "");
        const response = await fetch(
          `/api/teacher/standards/${encodeURIComponent(standardId)}/questions/${encodeURIComponent(questionId)}?${apiQuery.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (response.ok) {
          const json = (await response.json()) as QuestionDetailResponse;
          if (isCurrent) setData(json);
        }
      } catch (error) {
        if (
          isCurrent &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          console.error("[question-detail] failed to load question data", error);
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };
    void load();

    return () => {
      isCurrent = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standardId, questionId, searchParams.toString()]);

  const standardQuery = new URLSearchParams(forwardedQuery);
  const backHref = `/teacher-dashboard/standards/${encodeURIComponent(standardId)}${standardQuery.toString() ? `?${standardQuery.toString()}` : ""}`;
  const dashboardHref = `/teacher-dashboard${forwardedQuery.toString() ? `?${forwardedQuery.toString()}` : ""}`;

  const preview = data.question.preview;
  const text = preview?.text ?? "Question text unavailable.";
  const isShortAnswer = data.question.questionType === "open-ended";

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-10 sm:px-6 sm:py-12 lg:px-10 lg:py-14 xl:px-12">
      <Breadcrumbs
        items={[
          { label: "Teacher dashboard", href: dashboardHref },
          { label: data.standard?.id ?? standardId, href: backHref },
          { label: qIndex && qTotal ? `Question ${qIndex} of ${qTotal}` : "Question" },
        ]}
      />

      <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] p-5 sm:p-6 shadow-[var(--assignment-card-shadow)] mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading text-heading">
          {qIndex && qTotal ? `Question ${qIndex} of ${qTotal}` : "Question detail"}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
          <span className="rounded-full bg-[var(--assignment-calendar-nav-bg)] px-2 py-0.5 text-[var(--assignment-completed)]">
            {isShortAnswer ? "Short answer" : "MCQ"}
          </span>
          <span className="text-slate-gray/60">{data.standard?.id ?? standardId}</span>
        </div>
        <p className="mt-3 text-base leading-relaxed text-slate-gray">
          {isLoading ? "Loading question..." : <LatexText text={text} />}
        </p>
        {!isLoading && isShortAnswer && preview?.questionType === "open-ended" && (
          <div className="mt-3 space-y-2">
            {preview.parts.map((part) => (
              <div key={part.label} className="rounded-lg border border-border-subtle bg-surface-muted/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
                  Part {part.label} · {part.maxScore} pt{part.maxScore === 1 ? "" : "s"}
                </p>
                <p className="mt-1 text-sm text-slate-gray">
                  <LatexText text={part.prompt} />
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-gray/70">
            <span>
              Accuracy: <strong className="text-slate-gray">{data.summary.accuracy}%</strong>
            </span>
            <span className="inline-flex items-center gap-1">
              <Timer className="h-3.5 w-3.5" />
              Avg time: <strong className="text-slate-gray">{formatDuration(data.summary.averageTimeSec)}</strong>
            </span>
            <span>{data.summary.attempted} attempts total</span>
          </div>
          {data.question.setId && (
            <Link
              href={`/content/questions/${encodeURIComponent(data.question.setId)}?edit=${encodeURIComponent(data.question.questionId)}`}
              className={buttonClassNames("outline")}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit question
            </Link>
          )}
        </div>
      </section>

      {isShortAnswer ? (
        <ShortAnswerResponses data={data} isLoading={isLoading} />
      ) : (
        <>
          <ChoiceBreakdown data={data} isLoading={isLoading} />
          <ConfidenceGrid confidence={data.confidence} />
        </>
      )}
    </main>
  );
}

function ChoiceBreakdown({ data, isLoading }: { data: QuestionDetailResponse; isLoading: boolean }) {
  const mostCommonWrongId = (() => {
    let id: string | null = null;
    let max = 0;
    for (const choice of data.choices) {
      if (choice.isCorrect) continue;
      if (choice.count > max) {
        max = choice.count;
        id = choice.id;
      }
    }
    return max > 0 ? id : null;
  })();

  return (
    <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] shadow-[var(--assignment-card-shadow)] p-5 sm:p-6 mb-6">
      <h2 className="text-lg font-semibold text-slate-gray mb-1">Answer choices</h2>
      <p className="text-xs text-slate-gray/60 mb-4">
        Based on each student&apos;s most recent attempt. {data.totalStudents} student
        {data.totalStudents === 1 ? "" : "s"} total.
      </p>
      {data.choices.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-slate-gray/60">
          {isLoading ? "Loading answer data..." : "No attempts recorded for this question with the current filters."}
        </p>
      ) : (
        <div className="space-y-3">
          {data.choices.map((choice, index) => {
            const isMostCommonWrong = choice.id === mostCommonWrongId;
            const label = String.fromCharCode(65 + index);
            const rowClass = choice.isCorrect
              ? "border-[var(--assignment-completed)] bg-[var(--assignment-calendar-nav-bg)]"
              : isMostCommonWrong
                ? "border-rose-100 bg-rose-50 dark:border-rose-800/35 dark:bg-rose-950/40"
                : "border-border-subtle bg-surface";
            const barColor = choice.isCorrect
              ? "bg-[var(--assignment-completed)]"
              : isMostCommonWrong
                ? "bg-rose-500"
                : "bg-slate-300";
            const badgeClass = choice.isCorrect
              ? "bg-[var(--assignment-cta-bg-strong)] text-[var(--assignment-cta-text)]"
              : "border border-[var(--assignment-glass-border)] bg-[var(--surface)] text-slate-gray";
            const percentClass = choice.isCorrect
              ? "text-forest"
              : isMostCommonWrong
                ? "text-rose-600 dark:text-rose-300"
                : "text-slate-gray/70";
            return (
              <div key={choice.id} className={`flex items-center gap-3 rounded-xl border p-3 ${rowClass}`}>
                <span
                  className={`inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${badgeClass}`}
                >
                  {label}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-gray">
                    <LatexText text={choice.text} />
                  </p>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface/70">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${choice.percent}%` }} />
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className={`text-sm font-bold ${percentClass}`}>{choice.percent}%</p>
                  <p className="text-[10px] text-slate-gray/50">
                    {choice.count}/{data.totalStudents}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ShortAnswerResponses({
  data,
  isLoading,
}: {
  data: QuestionDetailResponse;
  isLoading: boolean;
}) {
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const toggleStudent = (studentId: string) => {
    setExpandedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const responsesByStudent = new Map<string, ShortAnswerResponseDetail[]>();
  for (const response of data.shortAnswerResponses) {
    const list = responsesByStudent.get(response.studentId) ?? [];
    list.push(response);
    responsesByStudent.set(response.studentId, list);
  }
  const studentGroups = Array.from(responsesByStudent.entries());

  const query = searchQuery.trim().toLowerCase();
  const filteredStudentGroups = query
    ? studentGroups.filter(
        ([, responses]) =>
          (responses[0]?.studentLabel ?? "").toLowerCase().includes(query) ||
          responses.some((response) => response.responseText.toLowerCase().includes(query)),
      )
    : studentGroups;

  return (
    <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] shadow-[var(--assignment-card-shadow)] p-5 sm:p-6 mb-6">
      <h2 className="text-lg font-semibold text-slate-gray mb-1">Student responses</h2>
      <p className="text-xs text-slate-gray/60 mb-4">
        Every attempt per part, with AI feedback. Click a student to expand.
      </p>
      {studentGroups.length > 0 && (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-gray/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by student name or response text"
            className="h-9 w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-9 py-2 text-sm text-slate-gray placeholder:text-slate-gray/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      )}
      {studentGroups.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-slate-gray/60">
          {isLoading
            ? "Loading student responses..."
            : "No responses recorded for this question with the current filters."}
        </p>
      ) : filteredStudentGroups.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-slate-gray/60">
          No students match your search.
        </p>
      ) : (
        <div className="space-y-2">
          {filteredStudentGroups.map(([studentId, responses]) => (
            <StudentResponseRow
              key={studentId}
              studentId={studentId}
              responses={responses}
              isExpanded={query ? true : expandedStudents.has(studentId)}
              onToggle={() => toggleStudent(studentId)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function StudentResponseRow({
  studentId,
  responses,
  isExpanded,
  onToggle,
}: {
  studentId: string;
  responses: ShortAnswerResponseDetail[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [selectedAttemptByPart, setSelectedAttemptByPart] = useState<
    Partial<Record<PartLabel, string>>
  >({});

  const responsesByPart = new Map<PartLabel, ShortAnswerResponseDetail[]>();
  for (const response of responses) {
    const list = responsesByPart.get(response.partLabel) ?? [];
    list.push(response);
    responsesByPart.set(response.partLabel, list);
  }
  const parts = Array.from(responsesByPart.entries());

  let resolvedCount = 0;
  let totalScore = 0;
  let totalMaxScore = 0;
  for (const [, attempts] of parts) {
    const latest = attempts[attempts.length - 1];
    if (latest.isCorrect) resolvedCount += 1;
    totalScore += latest.score;
    totalMaxScore += latest.maxScore;
  }
  const studentLabel = responses[0]?.studentLabel ?? studentId;
  const allResolved = resolvedCount === parts.length;

  return (
    <div className="rounded-xl border border-border-subtle">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-gray/50" />
          ) : (
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-gray/50" />
          )}
          <span className="text-sm font-semibold text-slate-gray">{studentLabel}</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3 whitespace-nowrap text-xs">
          <span className={`font-semibold ${allResolved ? "text-forest" : "text-slate-gray/70"}`}>
            {resolvedCount}/{parts.length} parts correct
          </span>
          <span className="text-slate-gray/60">
            {totalScore}/{totalMaxScore} pts
          </span>
        </div>
      </button>
      {isExpanded && (
        <div className="space-y-3 border-t border-border-subtle p-3">
          {parts.map(([partLabel, attempts]) => {
            const latest = attempts[attempts.length - 1];
            const selectedAttemptId =
              selectedAttemptByPart[partLabel] ?? latest.attemptId;
            const response =
              attempts.find(
                (attempt) => attempt.attemptId === selectedAttemptId,
              ) ?? latest;
            return (
              <div key={partLabel}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
                    Part {partLabel}
                  </p>
                  {attempts.length > 1 && (
                    <select
                      value={response.attemptId}
                      onChange={(event) =>
                        setSelectedAttemptByPart((prev) => ({
                          ...prev,
                          [partLabel]: event.target.value,
                        }))
                      }
                      className="h-7 rounded-xl border border-[var(--border-default)] bg-[var(--surface-muted)] px-2 text-xs font-medium text-slate-gray focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      {attempts.map((attempt) => (
                        <option key={attempt.attemptId} value={attempt.attemptId}>
                          Attempt {attempt.attemptNumber} ·{" "}
                          {formatShortAnswerAttemptTimestamp(attempt.answeredAt)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div
                  className={`rounded-lg border p-3 ${
                    response.isCorrect
                      ? "border-[var(--assignment-completed)] bg-[var(--assignment-calendar-nav-bg)]"
                      : "border-border-subtle bg-surface-muted/60"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-gray/60">
                      Attempt {response.attemptNumber} ·{" "}
                      {formatShortAnswerAttemptTimestamp(response.answeredAt)}
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        response.isCorrect ? "text-forest" : "text-slate-gray/70"
                      }`}
                    >
                      {response.score}/{response.maxScore}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-gray">
                    {response.responseText}
                  </p>
                  <TeacherAttemptFeedback feedback={response.feedback} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfidenceGrid({ confidence }: { confidence: ConfidenceQuadrantPercents }) {
  return (
    <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] shadow-[var(--assignment-card-shadow)] p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-gray mb-1">
        Confidence check — student self-assessment
      </h2>
      <p className="text-xs text-slate-gray/60 mb-4">
        Based on {confidence.total} confidence ratings submitted in Practice mode for this
        question.
      </p>
      {confidence.total === 0 ? (
        <p className="text-sm text-slate-gray/60">
          No confidence data has been recorded for this question yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ConfidenceCell
            value={confidence.mastery}
            label="Genuine mastery"
            sublabel="High confidence + Correct"
            className="bg-[var(--assignment-calendar-nav-bg)] text-heading"
          />
          <ConfidenceCell
            value={confidence.misconception}
            label="Priority misconception"
            sublabel="High confidence + Wrong — hardest to fix"
            className={badgeRose}
          />
          <ConfidenceCell
            value={confidence.fragile}
            label="Fragile understanding"
            sublabel="Low confidence + Correct — may fail under pressure"
            className={badgeAmber}
          />
          <ConfidenceCell
            value={confidence.expected}
            label="Expected gap"
            sublabel="Low confidence + Wrong — normal, system feedback helps"
            className="bg-surface-muted text-slate-gray/70"
          />
        </div>
      )}
    </section>
  );
}

function ConfidenceCell({
  value,
  label,
  sublabel,
  className,
}: {
  value: number;
  label: string;
  sublabel: string;
  className: string;
}) {
  return (
    <div className={`rounded-xl p-3 ${className}`}>
      <p className="text-xl font-bold">{value}%</p>
      <p className="text-xs font-semibold">{label}</p>
      <p className="mt-0.5 text-[10px] opacity-80">{sublabel}</p>
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
