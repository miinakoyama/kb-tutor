"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, RotateCcw, Save, SlidersHorizontal, X } from "lucide-react";
import { InfoPopover } from "@/components/InfoPopover";
import {
  DEFAULT_PERFORMANCE_THRESHOLDS,
  validatePerformanceThresholds,
  type PerformanceThresholds,
} from "@/lib/analytics/constants";

interface Props {
  thresholds: PerformanceThresholds;
  defaults: PerformanceThresholds;
  isCustom: boolean;
  onChange: (next: PerformanceThresholds, isCustom: boolean) => void;
}

type ScopeKey = "student" | "standard";

function clone(values: PerformanceThresholds): PerformanceThresholds {
  return {
    student: { ...values.student },
    standard: { ...values.standard },
  };
}

export function PerformanceThresholdsCard({
  thresholds,
  defaults,
  isCustom,
  onChange,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PerformanceThresholds>(() => clone(thresholds));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(clone(thresholds));
    }
  }, [thresholds, editing]);

  const validationError = useMemo(
    () => validatePerformanceThresholds(draft),
    [draft],
  );

  function updateDraft(scope: ScopeKey, key: keyof PerformanceThresholds["student"], value: number) {
    setDraft((prev) => ({
      ...prev,
      [scope]: { ...prev[scope], [key]: value },
    }));
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
      setEditing(false);
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
      setEditing(false);
    } catch (err) {
      console.error("[performance-thresholds] reset failed", err);
      setError("Failed to reset thresholds.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-[#16a34a]/25 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-gray">
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
                Each student or standard is placed in a band based on
                their accuracy in the active filter window. Accuracy is{" "}
                <span className="font-mono">correct ÷ attempted × 100</span>.
                Lower bounds are inclusive — for example, a student at
                exactly the Proficient cutoff is counted as Proficient.
              </p>
              <p className="mt-2">
                See <span className="font-mono">docs/performance-bands.md</span>{" "}
                for the full definitions, including the
                &quot;clicking without engaging&quot; rule.
              </p>
            </InfoPopover>
          </h2>
          <p className="mt-0.5 text-xs text-slate-gray/70">
            Aligned with the Keystone Biology performance levels.{" "}
            {isCustom ? (
              <span className="font-medium text-[#166534]">
                Using your custom thresholds.
              </span>
            ) : (
              <span>
                Using the default thresholds — edit to fit your class.
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!editing ? (
            <>
              {isCustom && (
                <button
                  type="button"
                  onClick={reset}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-gray hover:bg-slate-50 disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset to defaults
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setDraft(clone(thresholds));
                  setEditing(true);
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#16a34a] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#15803d]"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit thresholds
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(clone(thresholds));
                  setError(null);
                }}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-gray hover:bg-slate-50 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || Boolean(validationError)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#16a34a] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#15803d] disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving…" : "Save changes"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <ThresholdGroup
          title="Per-student bands"
          description="Used in the All students table and Student breakdown chart."
          scope="student"
          values={editing ? draft.student : thresholds.student}
          defaults={defaults.student}
          editing={editing}
          onChange={(key, value) => updateDraft("student", key, value)}
        />
        <ThresholdGroup
          title="Per-standard bands"
          description="Used in the Performance by standard table."
          scope="standard"
          values={editing ? draft.standard : thresholds.standard}
          defaults={defaults.standard}
          editing={editing}
          onChange={(key, value) => updateDraft("standard", key, value)}
        />
      </div>

      {(error || validationError) && editing && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error || validationError}
        </p>
      )}
    </section>
  );
}

interface GroupProps {
  title: string;
  description: string;
  scope: ScopeKey;
  values: PerformanceThresholds["student"];
  defaults: PerformanceThresholds["student"];
  editing: boolean;
  onChange: (
    key: keyof PerformanceThresholds["student"],
    value: number,
  ) => void;
}

function ThresholdGroup({
  title,
  description,
  scope,
  values,
  defaults,
  editing,
  onChange,
}: GroupProps) {
  const rows: {
    key: keyof PerformanceThresholds["student"];
    label: string;
    rangeDescription: string;
  }[] = [
    {
      key: "advancedMin",
      label: "Advanced",
      rangeDescription: `Accuracy ≥ value`,
    },
    {
      key: "proficientMin",
      label: "Proficient",
      rangeDescription: `value ≤ accuracy < Advanced`,
    },
    {
      key: "basicMin",
      label: "Basic",
      rangeDescription: `value ≤ accuracy < Proficient`,
    },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-3">
      <p className="text-sm font-semibold text-slate-gray">
        {title}{" "}
        <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-medium text-slate-gray/80">
          {scope}
        </span>
      </p>
      <p className="text-xs text-slate-gray/70">{description}</p>
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
              {editing ? (
                <label className="flex items-center gap-1.5">
                  <span className="sr-only">
                    {scope} {row.label} minimum accuracy
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
              ) : (
                <span className="inline-flex items-baseline gap-1 rounded-md bg-white px-2 py-0.5 text-sm font-semibold text-slate-gray">
                  ≥ {value}%
                </span>
              )}
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
          {Object.entries(DEFAULT_PERFORMANCE_THRESHOLDS[scope])
            .map(([k, v]) => `${k.replace("Min", "")} ${v}%`)
            .join(", ")}
          .
        </p>
      </div>
    </div>
  );
}
