"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { LatexText } from "@/components/shared/LatexText";
import type { AppRole } from "@/lib/auth/types";
import type {
  PerModeMetrics,
  QuestionDetailPayload,
  ScopeMode,
} from "@/lib/analytics/teacher-analytics-types";

interface QuestionDetailDrawerProps {
  role: AppRole;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  if (remainder === 0) return `${minutes}m`;
  return `${minutes}m ${remainder}s`;
}

export function QuestionDetailDrawer({ role }: QuestionDetailDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const questionId = searchParams.get("question");
  const studentId = searchParams.get("studentId");
  const [scopeMode, setScopeMode] = useState<ScopeMode>("selected");
  const [payload, setPayload] = useState<QuestionDetailPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!questionId) {
      setPayload(null);
      setError(null);
      return;
    }
    const params = new URLSearchParams();
    const range = searchParams.get("range");
    const sourceParam = searchParams.get("source");
    const modeParam = searchParams.get("mode");
    const classIdParam = searchParams.get("classId");
    if (range) params.set("range", range);
    if (sourceParam) params.set("source", sourceParam);
    if (modeParam) params.set("mode", modeParam);
    if (classIdParam) params.set("classId", classIdParam);
    if (studentId) params.set("studentId", studentId);
    if (role === "admin" && scopeMode === "all") params.set("scope", "all");
    const url = `/api/teacher-dashboard/questions/${encodeURIComponent(
      questionId,
    )}?${params.toString()}`;
    setIsLoading(true);
    setError(null);
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? "Question not found"
              : "Failed to load question detail",
          );
        }
        return (await res.json()) as QuestionDetailPayload;
      })
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Unexpected error");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [questionId, studentId, scopeMode, role, searchParams]);

  const closeDrawer = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("question");
    params.delete("studentId");
    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname);
  };

  useEffect(() => {
    if (!questionId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // closeDrawer is recreated each render; we intentionally do not include
    // it in the dependency array to avoid re-binding the listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  if (!questionId) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Question detail"
      data-testid="question-detail-drawer"
      className="fixed inset-0 z-40 flex"
    >
      <button
        type="button"
        aria-label="Close question detail"
        onClick={closeDrawer}
        className="absolute inset-0 bg-slate-900/30"
      />
      <aside className="relative ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-gray">
              Question detail
            </h2>
            {payload?.standardId && (
              <p className="text-xs text-slate-gray/60">
                {payload.standardId}
                {payload.standardLabel ? ` · ${payload.standardLabel}` : ""}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {role === "admin" && (
              <ScopeToggle value={scopeMode} onChange={setScopeMode} />
            )}
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="Close drawer"
              className="rounded-md p-1.5 text-slate-gray hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading && (
            <p className="text-sm text-slate-gray/60">Loading question detail…</p>
          )}
          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          {payload && !isLoading && (
            <DrawerBody payload={payload} role={role} />
          )}
        </div>
      </aside>
    </div>
  );
}

function ScopeToggle({
  value,
  onChange,
}: {
  value: ScopeMode;
  onChange: (next: ScopeMode) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
      <button
        type="button"
        aria-pressed={value === "selected"}
        onClick={() => onChange("selected")}
        className={`rounded-sm px-2 py-1 font-semibold transition-colors ${
          value === "selected"
            ? "bg-white text-[#166534] shadow"
            : "text-slate-gray/70"
        }`}
      >
        Selected schools
      </button>
      <button
        type="button"
        aria-pressed={value === "all"}
        onClick={() => onChange("all")}
        className={`rounded-sm px-2 py-1 font-semibold transition-colors ${
          value === "all"
            ? "bg-white text-[#166534] shadow"
            : "text-slate-gray/70"
        }`}
      >
        All schools
      </button>
    </div>
  );
}

function DrawerBody({
  payload,
  role,
}: {
  payload: QuestionDetailPayload;
  role: AppRole;
}) {
  const preview = payload.preview;
  const isEmpty = payload.summary.totalAttempts === 0;

  return (
    <div className="space-y-5">
      {preview ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-gray">
            <LatexText text={preview.text} />
          </p>
          <ul className="mt-3 space-y-2">
            {preview.options.map((option) => (
              <li
                key={option.id}
                className={`rounded-md border px-3 py-2 text-sm ${
                  option.id === preview.correctOptionId
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-gray"
                }`}
              >
                <LatexText text={option.text} />
                {option.id === preview.correctOptionId && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide">
                    Correct
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-slate-50/40 px-3 py-2 text-sm text-slate-gray/60">
          Preview unavailable for this question.
        </p>
      )}

      {payload.studentContext && (
        <section
          className="rounded-lg border border-slate-200 bg-slate-50/40 px-3 py-2 text-xs"
          data-testid="question-detail-student-context"
        >
          <p className="font-semibold uppercase tracking-wide text-slate-gray/60">
            This student
          </p>
          <p className="mt-0.5 text-slate-gray">
            <strong>{payload.studentContext.label}</strong> picked option{" "}
            <span className="font-mono">
              {payload.studentContext.selectedOptionId}
            </span>{" "}
            {payload.studentContext.isCorrect ? (
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Correct
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-rose-700">
                <XCircle className="h-3 w-3" /> Incorrect
              </span>
            )}
            · {payload.studentContext.mode} ·{" "}
            {new Date(payload.studentContext.answeredAt).toLocaleString()}
          </p>
        </section>
      )}

      {isEmpty ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50/40 px-3 py-2 text-sm text-slate-gray/60">
          No students have attempted this question yet
          {role === "admin" && payload.scope === "selected"
            ? " in the selected schools. Try switching scope to All schools."
            : "."}
        </p>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryStat label="Attempts" value={payload.summary.totalAttempts} />
            <SummaryStat
              label="Students"
              value={payload.summary.uniqueStudents}
            />
            <SummaryStat
              label="Accuracy"
              value={pct(payload.summary.accuracy)}
              helper={`${payload.summary.correct}/${payload.summary.totalAttempts}`}
            />
            <SummaryStat
              label="Avg time"
              value={formatDuration(payload.summary.averageTimeSec)}
              helper={
                payload.summary.timeP50Sec !== null &&
                payload.summary.timeP90Sec !== null
                  ? `p50 ${Math.round(payload.summary.timeP50Sec)}s · p90 ${Math.round(payload.summary.timeP90Sec)}s`
                  : ""
              }
            />
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
              By mode
            </h3>
            <div className="grid gap-2 sm:grid-cols-3">
              <ModeStat label="Practice" metrics={payload.byMode.practice} />
              <ModeStat label="Exam" metrics={payload.byMode.exam} />
              <ModeStat label="Review" metrics={payload.byMode.review} />
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
              Option distribution
            </h3>
            <ul className="space-y-2">
              {payload.optionDistribution.map((option) => (
                <li
                  key={option.optionId}
                  className={`rounded-md border px-3 py-2 ${
                    option.isCorrect
                      ? "border-emerald-200 bg-emerald-50/60"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={`font-medium ${
                        option.isCorrect ? "text-emerald-700" : "text-slate-gray"
                      }`}
                    >
                      <LatexText text={option.text} />
                      {option.isCorrect && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide">
                          Correct
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-slate-gray/70">
                      {option.picks} ({Math.round(option.share * 100)}%)
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${
                        option.isCorrect ? "bg-emerald-500" : "bg-slate-400"
                      }`}
                      style={{ width: `${Math.round(option.share * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  helper,
}: {
  label: string;
  value: number | string;
  helper?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-gray/60">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold text-slate-gray">{value}</p>
      {helper && <p className="text-[10px] text-slate-gray/60">{helper}</p>}
    </div>
  );
}

function ModeStat({
  label,
  metrics,
}: {
  label: string;
  metrics: PerModeMetrics;
}) {
  if (metrics.attempted === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
        <p className="text-xs font-semibold text-slate-gray/60">{label}</p>
        <p className="mt-1 text-[10px] text-slate-gray/40">no attempts</p>
      </div>
    );
  }
  const tone =
    metrics.accuracy >= 0.7
      ? "text-emerald-700"
      : metrics.accuracy >= 0.55
        ? "text-amber-700"
        : "text-rose-700";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
      <p className="text-xs font-semibold text-slate-gray/60">{label}</p>
      <p className={`mt-1 text-lg font-bold ${tone}`}>
        {pct(metrics.accuracy)}
      </p>
      <p className="text-[10px] text-slate-gray/60">
        {metrics.correct}/{metrics.attempted}
      </p>
    </div>
  );
}
