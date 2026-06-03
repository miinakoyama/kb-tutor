"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { LatexText } from "@/components/shared/LatexText";
import type {
  SampleMode,
  SampleQuestionPayload,
} from "@/lib/analytics/teacher-analytics-types";

interface Props {
  open: boolean;
  standardId: string;
  standardLabel: string;
  onClose: () => void;
}

const MODE_OPTIONS: { value: SampleMode; label: string; helper: string }[] = [
  { value: "random", label: "Random", helper: "Mix it up" },
  {
    value: "high_accuracy_first",
    label: "High accuracy first",
    helper: "Confidence-building warm-up",
  },
  {
    value: "low_accuracy_first",
    label: "Low accuracy first",
    helper: "Focus question",
  },
];

function generateSeed(): string {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 18);
}

export function SampleQuestionModal({
  open,
  standardId,
  standardLabel,
  onClose,
}: Props) {
  const [mode, setMode] = useState<SampleMode>("random");
  const [seed, setSeed] = useState<string>("");
  const [skip, setSkip] = useState(0);
  const [payload, setPayload] = useState<SampleQuestionPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSeed(generateSeed());
      setSkip(0);
      setMode("random");
      setPayload(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !seed) return;
    let cancelled = false;
    const url = `/api/teacher-dashboard/standards/${encodeURIComponent(
      standardId,
    )}/sample?sampleMode=${mode}&seed=${encodeURIComponent(
      seed,
    )}&skip=${skip}`;
    setIsLoading(true);
    setError(null);
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load sample question");
        return (await res.json()) as SampleQuestionPayload;
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
  }, [open, standardId, mode, seed, skip]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onModeChange = (next: SampleMode) => {
    setMode(next);
    setSkip(0);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sample question"
      data-testid="sample-question-modal"
      className="fixed inset-0 z-40 flex items-center justify-center px-4"
    >
      <button
        type="button"
        aria-label="Close sample question"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/30"
      />
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-gray">
              Sample question
            </h2>
            <p className="text-xs text-slate-gray/60">
              {standardId}
              {standardLabel ? ` · ${standardLabel}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-slate-gray hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <section className="border-b border-slate-100 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onModeChange(option.value)}
                aria-pressed={mode === option.value}
                title={option.helper}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  mode === option.value
                    ? "border-[#16a34a] bg-[#16a34a] text-white"
                    : "border-slate-200 bg-white text-slate-gray hover:bg-slate-50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-gray/60">
            {MODE_OPTIONS.find((opt) => opt.value === mode)?.helper}
          </p>
        </section>

        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          {isLoading && (
            <p className="text-sm text-slate-gray/60">Loading…</p>
          )}
          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          {payload && !isLoading && (
            <>
              {payload.questionId && payload.preview ? (
                <article className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-sm font-medium text-slate-gray">
                    <LatexText text={payload.preview.text} />
                  </p>
                  <ul className="mt-3 space-y-2">
                    {payload.preview.options.map((option) => (
                      <li
                        key={option.id}
                        className={`rounded-md border px-3 py-2 text-sm ${
                          option.id === payload.preview!.correctOptionId
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 text-slate-gray"
                        }`}
                      >
                        <LatexText text={option.text} />
                        {option.id === payload.preview!.correctOptionId && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide">
                            Correct
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </article>
              ) : (
                <p className="rounded-lg border border-slate-200 bg-slate-50/40 px-3 py-2 text-sm text-slate-gray/60">
                  No sample question available for this standard
                  {payload.totalAvailable > 0 ? " in this mode." : "."}
                </p>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs">
          <span className="text-slate-gray/60">
            {payload && payload.totalAvailable > 0
              ? `Question ${Math.min(payload.position + 1, payload.totalAvailable)} of ${payload.totalAvailable}`
              : ""}
          </span>
          <button
            type="button"
            disabled={
              !payload ||
              payload.questionId === null ||
              payload.isLast ||
              isLoading
            }
            onClick={() => setSkip((prev) => prev + 1)}
            className="rounded-md bg-[#16a34a] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#15803d] transition-colors disabled:opacity-50"
            data-testid="sample-show-another"
          >
            {payload && payload.questionId !== null && payload.isLast
              ? "No more questions for this mode"
              : "Show another"}
          </button>
        </footer>
      </div>
    </div>
  );
}
