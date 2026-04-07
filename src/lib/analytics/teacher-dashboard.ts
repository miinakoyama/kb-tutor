import type { StoredAnswer } from "@/lib/storage";
import type { MockAttempt } from "@/lib/mock-data";
import { getStandardById } from "@/lib/standards";

export interface DashboardFilters {
  teacherId: string;
  classId?: string;
  studentId?: string;
  from?: Date;
  to?: Date;
}

export interface StandardMetric {
  standardId: string;
  standardLabel: string;
  attempted: number;
  correct: number;
  accuracy: number;
  averageTimeSec: number;
}

export interface DashboardSummary {
  totalAnswered: number;
  totalCorrect: number;
  overallAccuracy: number;
}

export interface StudentMetric {
  studentId: string;
  totalAnswered: number;
  totalCorrect: number;
  accuracy: number;
}

export interface TeacherDashboardData {
  summary: DashboardSummary;
  byStandard: StandardMetric[];
  byStudent: StudentMetric[];
}

interface NormalizedAttempt {
  studentId: string;
  teacherId: string;
  classId: string;
  standardId: string;
  standardLabel: string;
  isCorrect: boolean;
  timeSpentSec: number;
  timestamp: Date;
}

const LEGACY_STANDARD_ID_ALIASES: Record<string, string> = {
  "BIO.2.1": "3.1.9-12.D",
};

const LEGACY_TOPIC_DEFAULT_STANDARD_ID: Record<string, string> = {
  "Basic Biological Principles": "3.1.9-12.A",
  "Chemical Basis for Life": "3.1.9-12.F",
  Bioenergetics: "3.1.9-12.E",
  "Homeostasis and Transport": "3.1.9-12.C",
  "Cell Growth and Reproduction": "3.1.9-12.D",
  Genetics: "3.1.9-12.P",
  "Theory of Evolution": "3.1.9-12.S",
  Ecology: "3.1.9-12.L",
};

function resolveStoredStandard(
  answer: StoredAnswer,
): { id: string; label: string } | undefined {
  if (answer.standardId) {
    const direct = getStandardById(answer.standardId);
    if (direct) {
      return { id: direct.id, label: direct.label };
    }
  }

  const aliasId = answer.standardId
    ? LEGACY_STANDARD_ID_ALIASES[answer.standardId]
    : undefined;
  if (aliasId) {
    const aliased = getStandardById(aliasId);
    if (aliased) {
      return { id: aliased.id, label: aliased.label };
    }
  }

  const legacyTopicKey = answer.topic ?? answer.standardLabel;
  if (legacyTopicKey) {
    const fallbackId = LEGACY_TOPIC_DEFAULT_STANDARD_ID[legacyTopicKey];
    if (fallbackId) {
      const fallback = getStandardById(fallbackId);
      if (fallback) {
        return { id: fallback.id, label: fallback.label };
      }
    }
  }

  return undefined;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function normalizeMockAttempt(attempt: MockAttempt): NormalizedAttempt {
  return {
    studentId: attempt.studentId,
    teacherId: attempt.teacherId,
    classId: attempt.classId,
    standardId: attempt.standardId,
    standardLabel: attempt.standardLabel,
    isCorrect: attempt.isCorrect,
    timeSpentSec: attempt.timeSpentSec,
    timestamp: new Date(attempt.timestamp),
  };
}

function normalizeStoredAnswer(answer: StoredAnswer): NormalizedAttempt | null {
  if (!answer.studentId || !answer.teacherId || !answer.classId) return null;
  const resolvedStandard = resolveStoredStandard(answer);
  return {
    studentId: answer.studentId,
    teacherId: answer.teacherId,
    classId: answer.classId,
    standardId: resolvedStandard?.id ?? answer.standardId ?? "BIO.OTHER",
    standardLabel:
      resolvedStandard?.label ??
      answer.standardLabel ??
      answer.topic ??
      "Other",
    isCorrect: answer.isCorrect,
    timeSpentSec: answer.timeSpentSec ?? 0,
    timestamp: new Date(answer.timestamp),
  };
}

export function buildTeacherDashboardData(
  mockAttempts: MockAttempt[],
  localAnswers: StoredAnswer[],
  filters: DashboardFilters,
): TeacherDashboardData {
  const normalized = [
    ...mockAttempts.map(normalizeMockAttempt),
    ...localAnswers
      .map(normalizeStoredAnswer)
      .filter((value): value is NormalizedAttempt => value !== null),
  ];

  const filtered = normalized.filter((attempt) => {
    if (attempt.teacherId !== filters.teacherId) return false;
    if (filters.classId && attempt.classId !== filters.classId) return false;
    if (filters.studentId && attempt.studentId !== filters.studentId) return false;
    if (filters.from && attempt.timestamp < filters.from) return false;
    if (filters.to && attempt.timestamp > filters.to) return false;
    return true;
  });

  const totalAnswered = filtered.length;
  const totalCorrect = filtered.filter((attempt) => attempt.isCorrect).length;
  const overallAccuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  const standards = new Map<string, StandardMetric>();
  for (const attempt of filtered) {
    const existing = standards.get(attempt.standardId);
    if (!existing) {
      standards.set(attempt.standardId, {
        standardId: attempt.standardId,
        standardLabel: attempt.standardLabel,
        attempted: 1,
        correct: attempt.isCorrect ? 1 : 0,
        accuracy: 0,
        averageTimeSec: attempt.timeSpentSec,
      });
      continue;
    }
    existing.attempted += 1;
    if (attempt.isCorrect) existing.correct += 1;
    existing.averageTimeSec += attempt.timeSpentSec;
  }

  const byStandard = Array.from(standards.values())
    .map((item) => {
      const accuracy = item.attempted > 0 ? (item.correct / item.attempted) * 100 : 0;
      return {
        ...item,
        accuracy: Math.round(clampPercent(accuracy)),
        averageTimeSec: item.attempted > 0 ? Math.round(item.averageTimeSec / item.attempted) : 0,
      };
    })
    .sort((a, b) => a.standardId.localeCompare(b.standardId));

  const students = new Map<string, StudentMetric>();
  for (const attempt of filtered) {
    const existing = students.get(attempt.studentId);
    if (!existing) {
      students.set(attempt.studentId, {
        studentId: attempt.studentId,
        totalAnswered: 1,
        totalCorrect: attempt.isCorrect ? 1 : 0,
        accuracy: 0,
      });
      continue;
    }
    existing.totalAnswered += 1;
    if (attempt.isCorrect) existing.totalCorrect += 1;
  }

  const byStudent = Array.from(students.values())
    .map((item) => ({
      ...item,
      accuracy: item.totalAnswered > 0 ? Math.round((item.totalCorrect / item.totalAnswered) * 100) : 0,
    }))
    .sort((a, b) => b.totalAnswered - a.totalAnswered);

  return {
    summary: {
      totalAnswered,
      totalCorrect,
      overallAccuracy,
    },
    byStandard,
    byStudent,
  };
}
