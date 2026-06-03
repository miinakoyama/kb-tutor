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
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300",
    bar: "bg-emerald-600",
    text: "text-emerald-800",
    chipActive: "bg-emerald-700 text-white border-emerald-700",
    chipIdle: "border-emerald-200 text-emerald-800 bg-white hover:bg-emerald-50",
    swatch: "#047857",
  },
  proficient: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    bar: "bg-emerald-500",
    text: "text-emerald-700",
    chipActive: "bg-emerald-600 text-white border-emerald-600",
    chipIdle: "border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50",
    swatch: "#16a34a",
  },
  basic: {
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    bar: "bg-amber-500",
    text: "text-amber-700",
    chipActive: "bg-amber-500 text-white border-amber-500",
    chipIdle: "border-amber-200 text-amber-700 bg-white hover:bg-amber-50",
    swatch: "#f59e0b",
  },
  below_basic: {
    badge: "bg-rose-50 text-rose-700 border-rose-200",
    bar: "bg-rose-500",
    text: "text-rose-700",
    chipActive: "bg-rose-600 text-white border-rose-600",
    chipIdle: "border-rose-200 text-rose-700 bg-white hover:bg-rose-50",
    swatch: "#f43f5e",
  },
  not_started: {
    badge: "bg-slate-50 text-slate-500 border-slate-200",
    bar: "bg-slate-300",
    text: "text-slate-500",
    chipActive: "bg-slate-700 text-white border-slate-700",
    chipIdle: "border-slate-300 text-slate-600 bg-white hover:bg-slate-100",
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
  t: PerformanceThresholds[typeof scope],
): BandDescriptor[] {
  const subject = scope === "student" ? "student" : "class on this standard";
  return [
    {
      key: "advanced",
      label: BAND_LABELS.advanced,
      range: `≥ ${t.advancedMin}%`,
      meaning: `Accuracy ≥ ${t.advancedMin}%. The ${subject} has mastered the material.`,
    },
    {
      key: "proficient",
      label: BAND_LABELS.proficient,
      range: `${t.proficientMin}% ≤ accuracy < ${t.advancedMin}%`,
      meaning: `Accuracy is at least ${t.proficientMin}% and below ${t.advancedMin}%. The ${subject} is on track for the Keystone exam.`,
    },
    {
      key: "basic",
      label: BAND_LABELS.basic,
      range: `${t.basicMin}% ≤ accuracy < ${t.proficientMin}%`,
      meaning: `Accuracy is at least ${t.basicMin}% and below ${t.proficientMin}%. Approaching proficiency; revisit the core concepts.`,
    },
    {
      key: "below_basic",
      label: BAND_LABELS.below_basic,
      range: `< ${t.basicMin}%`,
      meaning: `Accuracy below ${t.basicMin}%. Needs re-teaching of the underlying material.`,
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
  return describeBands("student", thresholds.student);
}

export function describeStandardBands(
  thresholds: PerformanceThresholds,
): BandDescriptor[] {
  return describeBands("standard", thresholds.standard);
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
