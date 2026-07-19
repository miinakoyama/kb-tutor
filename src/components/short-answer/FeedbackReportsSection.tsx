"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Flag,
  Loader2,
  RotateCcw,
} from "lucide-react";
import type { GradedFeedback } from "@/types/short-answer";
import { verdictDisplay } from "@/components/short-answer/verdict-display";
import { Button } from "@/components/ui/Button";

type StatusTab = "unreviewed" | "reviewed" | "all";

interface ReportAttempt {
  responseText: string;
  score: number | null;
  maxScore: number | null;
  feedback: GradedFeedback | null;
  method: string | null;
  modelId: string | null;
  confidence: string | null;
}

interface ReportRow {
  id: string;
  createdAt: string;
  student: { id: string; displayName: string | null };
  questionId: string;
  questionPreview: string | null;
  partLabel: string;
  note: string | null;
  attempt: ReportAttempt | null;
  reviewedAt: string | null;
}

interface ReportsResponse {
  reports: ReportRow[];
  total: number;
}

const TABS: Array<{ id: StatusTab; label: string }> = [
  { id: "unreviewed", label: "Unreviewed" },
  { id: "reviewed", label: "Reviewed" },
  { id: "all", label: "All" },
];

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function FeedbackReportsSection() {
  const [tab, setTab] = useState<StatusTab>("unreviewed");
  const [data, setData] = useState<ReportsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (status: StatusTab) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/feedback-reports?status=${status}`, {
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403) {
        setData(null);
        setLoadError("You do not have access to feedback reports.");
        return;
      }
      if (!res.ok) throw new Error("Failed to load feedback reports.");
      setData((await res.json()) as ReportsResponse);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [load, tab]);

  const toggleReviewed = async (report: ReportRow) => {
    setPendingId(report.id);
    setActionError(null);
    try {
      const res = await fetch("/api/feedback-reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: report.id,
          reviewed: report.reviewedAt === null,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to update the report.");
      }
      await load(tab);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update the report.",
      );
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--assignment-glass-border)] bg-[var(--assignment-glass-bg-strong)] shadow-[var(--assignment-card-shadow)] mb-6">
      <div className="border-b border-border-subtle px-5 py-4">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-slate-gray tracking-[-0.2px]">
          <Flag className="h-5 w-5 text-[var(--assignment-completed)]" />
          Short-answer feedback reports
        </h2>
        <p className="mt-1 text-sm text-slate-gray/60">
          Students flag AI feedback that seems wrong or confusing. Review the
          submitted answer and the feedback they saw, then mark the report as
          reviewed.
        </p>
      </div>

      <div className="px-5 pt-4">
        <div
          role="tablist"
          aria-label="Report status filter"
          className="inline-flex rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-1"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setExpandedId(null);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? "bg-[var(--assignment-cta-bg-strong)] text-[var(--assignment-cta-text)]"
                  : "text-slate-gray hover:bg-[var(--surface)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-4">
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-gray/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading reports...
          </div>
        ) : loadError ? (
          <p className="py-6 text-sm text-slate-gray/70">{loadError}</p>
        ) : !data || data.reports.length === 0 ? (
          <p className="py-6 text-sm text-slate-gray/60">
            {tab === "unreviewed"
              ? "No unreviewed reports. You're all caught up."
              : "No reports to show."}
          </p>
        ) : (
          <ul className="space-y-3">
            {data.reports.map((report) => {
              const isExpanded = expandedId === report.id;
              const feedback = report.attempt?.feedback ?? null;
              const verdict = feedback
                ? verdictDisplay(feedback.verdict)
                : null;
              return (
                <li
                  key={report.id}
                  className="rounded-xl border border-border-default"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-gray">
                          {report.student.displayName ?? "Unknown student"}
                        </span>
                        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-gray/70">
                          Part {report.partLabel}
                        </span>
                        <span className="text-xs text-slate-gray/50">
                          {formatTimestamp(report.createdAt)}
                        </span>
                        {report.reviewedAt && (
                          <span className="rounded-full bg-[var(--assignment-calendar-nav-bg)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--assignment-completed)]">
                            Reviewed
                          </span>
                        )}
                      </div>
                      {report.questionPreview && (
                        <p className="mt-1 truncate text-xs text-slate-gray/60">
                          {report.questionPreview}
                        </p>
                      )}
                      {report.note && (
                        <p className="mt-1 text-sm text-slate-gray">
                          &ldquo;{report.note}&rdquo;
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : report.id)
                        }
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        {isExpanded ? "Hide context" : "View context"}
                      </Button>
                      <Button
                        variant={report.reviewedAt ? "outline" : "primary"}
                        disabled={pendingId === report.id}
                        onClick={() => void toggleReviewed(report)}
                      >
                        {pendingId === report.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : report.reviewedAt ? (
                          <RotateCcw className="h-3.5 w-3.5" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        {report.reviewedAt ? "Mark unreviewed" : "Mark reviewed"}
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="space-y-3 border-t border-border-subtle px-4 py-3">
                      {report.attempt ? (
                        <>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
                              Submitted answer
                            </p>
                            <p className="mt-1 whitespace-pre-wrap rounded-lg bg-surface-muted px-3 py-2 text-sm text-slate-gray">
                              {report.attempt.responseText || "(empty)"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/60">
                              AI feedback shown to the student
                            </p>
                            {feedback ? (
                              <div
                                className={`mt-1 rounded-lg border px-3 py-2 ${
                                  verdict?.tone === "correct"
                                    ? "border-[var(--assignment-completed)] bg-[var(--assignment-calendar-nav-bg)]"
                                    : "border-rose-200 bg-rose-50/60"
                                }`}
                              >
                                {verdict && (
                                  <p className="text-sm font-semibold text-slate-gray">
                                    {verdict.glyph} {verdict.phrase}
                                  </p>
                                )}
                                {feedback.segments.map((segment, i) => (
                                  <div key={i} className="mt-2">
                                    {segment.label.trim().length > 0 && (
                                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-gray/60">
                                        {segment.label}
                                      </p>
                                    )}
                                    <p className="text-sm text-slate-gray">
                                      {segment.text}
                                    </p>
                                  </div>
                                ))}
                                {feedback.modelAnswer && (
                                  <div className="mt-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-gray/60">
                                      Model answer
                                    </p>
                                    <p className="text-sm text-slate-gray">
                                      {feedback.modelAnswer}
                                    </p>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="mt-1 text-sm text-slate-gray/60">
                                No feedback was recorded for this attempt.
                              </p>
                            )}
                          </div>
                          <p className="text-xs text-slate-gray/50">
                            Score {report.attempt.score ?? "–"}/
                            {report.attempt.maxScore ?? "–"} · Method{" "}
                            {report.attempt.method ?? "–"} · Model{" "}
                            {report.attempt.modelId ?? "–"} · Confidence{" "}
                            {report.attempt.confidence ?? "–"}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-slate-gray/60">
                          The referenced attempt is no longer available.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {actionError && (
          <p className="mt-3 text-xs text-rose-600">{actionError}</p>
        )}
      </div>
    </section>
  );
}
