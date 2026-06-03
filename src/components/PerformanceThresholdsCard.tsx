"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Save, SlidersHorizontal, X } from "lucide-react";
import { InfoPopover } from "@/components/InfoPopover";
import {
  validatePerformanceThresholds,
  type PerformanceThresholds,
} from "@/lib/analytics/constants";

interface Props {
  thresholds: PerformanceThresholds;
  defaults: PerformanceThresholds;
  isCustom: boolean;
  onChange: (next: PerformanceThresholds, isCustom: boolean) => void;
}

function clone(values: PerformanceThresholds): PerformanceThresholds {
  return { ...values };
}

export function PerformanceThresholdsCard({
  thresholds,
  defaults,
  isCustom,
  onChange,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<PerformanceThresholds>(() => clone(thresholds));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setDraft(clone(thresholds));
    }
  }, [thresholds, isOpen]);

  const validationError = useMemo(
    () => validatePerformanceThresholds(draft),
    [draft],
  );

  function updateDraft(key: keyof PerformanceThresholds, value: number) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/teacher/performance-thresholds", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error || "Failed to save thresholds.");
        return;
      }
      const body = (await res.json()) as {
        thresholds: PerformanceThresholds;
        isCustom: boolean;
      };
      onChange(body.thresholds, body.isCustom);
      setIsOpen(false);
    } catch (err) {
      console.error("[performance-thresholds] save failed", err);
      setError("Failed to save thresholds.");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/teacher/performance-thresholds", {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error || "Failed to reset thresholds.");
        return;
      }
      const body = (await res.json()) as {
        thresholds: PerformanceThresholds;
        isCustom: boolean;
      };
      onChange(body.thresholds, body.isCustom);
      setDraft(clone(body.thresholds));
      setIsOpen(false);
    } catch (err) {
      console.error("[performance-thresholds] reset failed", err);
      setError("Failed to reset thresholds.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(clone(thresholds));
          setIsOpen(true);
          setError(null);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-gray transition-colors hover:border-[#16a34a]/40 hover:bg-[#16a34a]/10 hover:text-[#166534]"
      >
        <SlidersHorizontal className="h-4 w-4" />
        Band settings
        {isCustom && (
          <span className="rounded-full bg-[#16a34a]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#166534]">
            Custom
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-6 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="performance-bands-title"
        >
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <h2
                  id="performance-bands-title"
                  className="flex items-center gap-2 text-base font-semibold text-slate-gray"
                >
                  <SlidersHorizontal className="h-4 w-4 text-[#16a34a]" />
                  Performance bands
                  <InfoPopover
                    label="How are performance bands computed?"
                    width="wide"
                    align="start"
                  >
                    <p className="font-semibold text-slate-gray">
                      How bands are computed
                    </p>
                    <p className="mt-1">
                      Students and standards use the same band thresholds.
                      Accuracy is{" "}
                      <span className="font-mono">correct ÷ attempted × 100</span>.
                      Lower bounds are inclusive.
                    </p>
                  </InfoPopover>
                </h2>
                <p className="mt-1 text-xs text-slate-gray/70">
                  These thresholds control the status colors and labels across
                  the dashboard.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setDraft(clone(thresholds));
                  setError(null);
                }}
                disabled={saving}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-gray/60 transition-colors hover:bg-slate-100 hover:text-slate-gray disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </div>

            <div className="px-5 py-4">
              <ThresholdGroup
                values={draft}
                defaults={defaults}
                onChange={updateDraft}
              />

              {(error || validationError) && (
                <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {error || validationError}
                </p>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {isCustom && (
                  <button
                    type="button"
                    onClick={() => void reset()}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-gray hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset to defaults
                  </button>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setDraft(clone(thresholds));
                    setError(null);
                  }}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-gray hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || Boolean(validationError)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#16a34a] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#15803d] disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface GroupProps {
  values: PerformanceThresholds;
  defaults: PerformanceThresholds;
  onChange: (key: keyof PerformanceThresholds, value: number) => void;
}

function ThresholdGroup({
  values,
  defaults,
  onChange,
}: GroupProps) {
  const rows: {
    key: keyof PerformanceThresholds;
    label: string;
    rangeDescription: string;
  }[] = [
    {
      key: "advancedMin",
      label: "Advanced",
      rangeDescription: `and above`,
    },
    {
      key: "proficientMin",
      label: "Proficient",
      rangeDescription: `to below Advanced`,
    },
    {
      key: "basicMin",
      label: "Basic",
      rangeDescription: `to below Proficient`,
    },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
      <p className="text-sm font-semibold text-slate-gray">
        Thresholds
      </p>
      <p className="text-xs text-slate-gray/70">
        Used for both student rows and standard rollups.
      </p>
      <div className="mt-3 space-y-2">
        {rows.map((row) => {
          const value = values[row.key];
          const defaultValue = defaults[row.key];
          const changed = value !== defaultValue;
          return (
            <div
              key={row.key}
              className="flex flex-wrap items-center gap-2 text-xs"
            >
              <span className="w-24 font-medium text-slate-gray">
                {row.label}
              </span>
              <label className="flex items-center gap-1.5">
                <span className="sr-only">
                  {row.label} minimum accuracy
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={value}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    onChange(row.key, Number.isFinite(next) ? next : value);
                  }}
                  className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-sm text-slate-gray focus:border-[#16a34a] focus:outline-none focus:ring-2 focus:ring-[#16a34a]/20"
                />
                <span className="text-slate-gray/70">%</span>
              </label>
              <span className="text-slate-gray/60">{row.rangeDescription}</span>
              {changed && (
                <span className="ml-auto text-[10px] font-medium text-slate-gray/60">
                  default {defaultValue}%
                </span>
              )}
            </div>
          );
        })}
        <p className="text-[11px] text-slate-gray/60">
          Below Basic ={" "}
          <span className="font-mono">accuracy &lt; {values.basicMin}%</span>.
          Defaults:{" "}
          {Object.entries(defaults)
            .map(([k, v]) => `${k.replace("Min", "")} ${v}%`)
            .join(", ")}
          .
        </p>
      </div>
    </div>
  );
}
