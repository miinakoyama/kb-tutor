import type {
  PerformanceThresholds,
} from "@/lib/analytics/constants";
import type {
  StandardStatus,
  StudentStatus,
} from "@/lib/analytics/teacher-dashboard-server";

export type PerformanceBandKey =
  | "advanced"
  | "proficient"
  | "basic"
  | "below_basic"
  | "not_started";

export interface BandTone {
  badge: string;
  bar: string;
  text: string;
  chipActive: string;
  chipIdle: string;
  swatch: string;
}

export const BAND_TONES: Record<PerformanceBandKey, BandTone> = {
  advanced: {
    badge:
      "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/50 dark:text-emerald-100 dark:border-emerald-700/40",
    bar: "bg-emerald-600 dark:bg-emerald-500/90",
    text: "text-emerald-800 dark:text-emerald-200",
    chipActive:
      "bg-emerald-700 text-white border-emerald-700 dark:bg-emerald-800/80 dark:border-emerald-700/60 dark:text-emerald-50",
    chipIdle:
      "border-emerald-200 text-emerald-800 bg-surface hover:bg-emerald-50 dark:border-emerald-800/35 dark:text-emerald-200 dark:bg-surface-muted dark:hover:bg-emerald-950/30",
    swatch: "#047857",
  },
  proficient: {
    badge:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/45 dark:text-emerald-200/90 dark:border-emerald-800/35",
    bar: "bg-emerald-500 dark:bg-emerald-600/80",
    text: "text-emerald-700 dark:text-emerald-300",
    chipActive:
      "bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-800/75 dark:border-emerald-700/50 dark:text-emerald-50",
    chipIdle:
      "border-emerald-200 text-emerald-700 bg-surface hover:bg-emerald-50 dark:border-emerald-800/35 dark:text-emerald-300 dark:bg-surface-muted dark:hover:bg-emerald-950/30",
    swatch: "var(--primary)",
  },
  basic: {
    badge:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/45 dark:text-amber-200/90 dark:border-amber-800/35",
    bar: "bg-amber-500 dark:bg-amber-600/80",
    text: "text-amber-700 dark:text-amber-300",
    chipActive:
      "bg-amber-500 text-white border-amber-500 dark:bg-amber-800/75 dark:border-amber-700/50 dark:text-amber-50",
    chipIdle:
      "border-amber-200 text-amber-700 bg-surface hover:bg-amber-50 dark:border-amber-800/35 dark:text-amber-300 dark:bg-surface-muted dark:hover:bg-amber-950/30",
    swatch: "#f59e0b",
  },
  below_basic: {
    badge:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/45 dark:text-rose-200/90 dark:border-rose-800/35",
    bar: "bg-rose-500 dark:bg-rose-600/80",
    text: "text-rose-700 dark:text-rose-300",
    chipActive:
      "bg-rose-600 text-white border-rose-600 dark:bg-rose-900/75 dark:border-rose-800/50 dark:text-rose-100",
    chipIdle:
      "border-rose-200 text-rose-700 bg-surface hover:bg-rose-50 dark:border-rose-800/35 dark:text-rose-300 dark:bg-surface-muted dark:hover:bg-rose-950/30",
    swatch: "#f43f5e",
  },
  not_started: {
    badge: "bg-surface-muted text-muted-foreground border-border-default",
    bar: "bg-slate-300 dark:bg-slate-600/70",
    text: "text-muted-foreground",
    chipActive:
      "bg-foreground text-background border-foreground dark:bg-foreground/90 dark:text-background",
    chipIdle:
      "border-border-default text-muted-foreground bg-surface hover:bg-surface-muted",
    swatch: "#cbd5e1",
  },
};

export const BAND_LABELS: Record<PerformanceBandKey, string> = {
  advanced: "Advanced",
  proficient: "Proficient",
  basic: "Basic",
  below_basic: "Below Basic",
  not_started: "Not Started",
};

export interface BandDescriptor {
  key: PerformanceBandKey;
  label: string;
  /** Short, human readable rule, e.g. "70%–84%". */
  range: string;
  /** Plain English meaning of the band. */
  meaning: string;
}

function describeBands(
  scope: "student" | "standard",
  thresholds: PerformanceThresholds,
): BandDescriptor[] {
  const subject = scope === "student" ? "student" : "class on this standard";
  return [
    {
      key: "advanced",
      label: BAND_LABELS.advanced,
      range: `≥ ${thresholds.advancedMin}%`,
      meaning: `Accuracy ≥ ${thresholds.advancedMin}%. The ${subject} has mastered the material.`,
    },
    {
      key: "proficient",
      label: BAND_LABELS.proficient,
      range: `${thresholds.proficientMin}% ≤ accuracy < ${thresholds.advancedMin}%`,
      meaning: `Accuracy is at least ${thresholds.proficientMin}% and below ${thresholds.advancedMin}%. The ${subject} is on track for the Keystone exam.`,
    },
    {
      key: "basic",
      label: BAND_LABELS.basic,
      range: `${thresholds.basicMin}% ≤ accuracy < ${thresholds.proficientMin}%`,
      meaning: `Accuracy is at least ${thresholds.basicMin}% and below ${thresholds.proficientMin}%. Approaching proficiency; revisit the core concepts.`,
    },
    {
      key: "below_basic",
      label: BAND_LABELS.below_basic,
      range: `< ${thresholds.basicMin}%`,
      meaning: `Accuracy below ${thresholds.basicMin}%. Needs re-teaching of the underlying material.`,
    },
    {
      key: "not_started",
      label: BAND_LABELS.not_started,
      range: "no attempts",
      meaning: "No attempts recorded in the active filter window.",
    },
  ];
}

export function describeStudentBands(
  thresholds: PerformanceThresholds,
): BandDescriptor[] {
  return describeBands("student", thresholds);
}

export function describeStandardBands(
  thresholds: PerformanceThresholds,
): BandDescriptor[] {
  return describeBands("standard", thresholds);
}

export function findStudentBand(
  status: StudentStatus,
  thresholds: PerformanceThresholds,
): BandDescriptor {
  const bands = describeStudentBands(thresholds);
  return bands.find((band) => band.key === status) ?? bands[bands.length - 1];
}

export function findStandardBand(
  status: StandardStatus,
  thresholds: PerformanceThresholds,
): BandDescriptor {
  const bands = describeStandardBands(thresholds);
  return bands.find((band) => band.key === status) ?? bands[bands.length - 1];
}
