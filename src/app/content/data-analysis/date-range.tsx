"use client";

import { useMemo } from "react";

// Shared preset picker used across Data Analysis tabs. Each preset resolves to
// a `{ from, to }` pair in `YYYY-MM-DD` format (matching the existing API
// convention). Selecting a preset calls `onChange` with the same pair.

export type DateRange = { from: string; to: string };

export type PresetKey =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_14_days"
  | "last_30_days"
  | "custom";

interface DateRangePickerProps {
  value: DateRange;
  onChange: (next: DateRange) => void;
}

function isoDateOnly(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function presetRange(key: PresetKey): DateRange {
  const today = new Date();
  const todayStr = isoDateOnly(today);
  switch (key) {
    case "today":
      return { from: todayStr, to: todayStr };
    case "yesterday": {
      const y = isoDateOnly(daysAgo(1));
      return { from: y, to: y };
    }
    case "last_7_days":
      return { from: isoDateOnly(daysAgo(6)), to: todayStr };
    case "last_14_days":
      return { from: isoDateOnly(daysAgo(13)), to: todayStr };
    case "last_30_days":
      return { from: isoDateOnly(daysAgo(29)), to: todayStr };
    case "custom":
    default:
      return { from: todayStr, to: todayStr };
  }
}

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last_7_days", label: "Last 7 days" },
  { key: "last_14_days", label: "Last 14 days" },
  { key: "last_30_days", label: "Last 30 days" },
];

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const activeKey = useMemo<PresetKey>(() => {
    for (const preset of PRESETS) {
      const range = presetRange(preset.key);
      if (range.from === value.from && range.to === value.to) return preset.key;
    }
    return "custom";
  }, [value.from, value.to]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1">
        {PRESETS.map((preset) => {
          const isActive = preset.key === activeKey;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => onChange(presetRange(preset.key))}
              className={
                isActive
                  ? "rounded-md bg-[#16a34a] px-3 py-1.5 text-xs font-medium text-white"
                  : "rounded-md px-3 py-1.5 text-xs font-medium text-slate-gray border border-slate-200 hover:bg-slate-50"
              }
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-gray">
          <span className="block mb-1 font-medium">From</span>
          <input
            type="date"
            value={value.from}
            onChange={(event) => onChange({ ...value, from: event.target.value })}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs text-slate-gray">
          <span className="block mb-1 font-medium">To</span>
          <input
            type="date"
            value={value.to}
            onChange={(event) => onChange({ ...value, to: event.target.value })}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
      </div>
    </div>
  );
}

export function defaultPilotRange(): DateRange {
  return presetRange("last_14_days");
}

export function todayRange(): DateRange {
  return presetRange("today");
}
