"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Home, Loader2 } from "lucide-react";
import { AdaptivePracticeMode } from "@/components/modes/AdaptivePracticeMode";
import { ExamMode } from "@/components/modes/ExamMode";
import { ReviewMode } from "@/components/modes/ReviewMode";
import { useQuestions } from "@/hooks/useQuestions";
import type {
  PracticeMode as PracticeModeType,
  Question,
} from "@/types/question";
import { getStandardById, type ModuleCode } from "@/lib/standards";
import { emitAllAssignmentsCompletedEvent } from "@/lib/all-assignments-complete-modal";

const VALID_MODES: PracticeModeType[] = ["practice", "exam", "review"];

export type AnsweredMap = Record<
  string,
  { selectedOptionId: string | null; isCorrect: boolean; answeredAt: string }
>;

/**
 * Tolerantly decode a %-encoded string. Next.js already decodes searchParams
 * once, so for correctly-sent (raw) values this is effectively a no-op. We
 * keep it for backwards compatibility with legacy URLs that were built with
 * the old double-encode pattern. Invalid sequences (e.g. a literal "%" in a
 * topic name) are returned as-is instead of throwing URIError.
 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
const MODULE_CATEGORY_TOPIC_PATTERN =
  /^\s*(?:\[?\s*Module\s+([AB])\s*\]?\s*[-:]\s*)?(.+?)\s*$/i;

interface PracticePageClientProps {
  topicsParam?: string;
  modeParam?: string;
  questionsParam?: string;
  questionIdsParam?: string;
  assignmentIdParam?: string;
}

function InvalidParamsMessage({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="rounded-xl border border-primary/30 bg-surface p-8 text-center max-w-md">
        <p className="text-slate-gray mb-4">{message}</p>
        <Link
          href="/self-practice"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-lg text-white font-medium transition-colors bg-primary hover:bg-primary-hover focus-visible:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <Home className="w-4 h-4" />
          Back to Self Practice
        </Link>
      </div>
    </div>
  );
}

export function PracticePageClient({
  topicsParam,
  modeParam,
  questionsParam,
  questionIdsParam,
  assignmentIdParam,
}: PracticePageClientProps) {
  const normalizedModeParam =
    modeParam === "adaptive" ? "practice" : modeParam;
  const { visibleQuestions, isLoaded, role } = useQuestions();
  const [snapshotQuestions, setSnapshotQuestions] = useState<Question[] | null>(
    null
  );
  const [answeredMap, setAnsweredMap] = useState<AnsweredMap>({});
  const [assignmentRunAfter, setAssignmentRunAfter] = useState<string | null>(null);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false);

  const handleAllSchoolAssignmentsCompleted = useCallback(() => {
    emitAllAssignmentsCompletedEvent();
  }, []);

  useEffect(() => {
    const assignmentId = assignmentIdParam?.trim();
    if (!assignmentId) {
      setSnapshotQuestions(null);
      setAnsweredMap({});
      setAssignmentRunAfter(null);
      setIsSnapshotLoading(false);
      return;
    }

    const loadSnapshot = async () => {
      setIsSnapshotLoading(true);
      try {
        const response = await fetch(
          `/api/assignments/${encodeURIComponent(assignmentId)}/questions`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          setSnapshotQuestions(null);
          setAnsweredMap({});
          setAssignmentRunAfter(null);
          setIsSnapshotLoading(false);
          return;
        }
        const payload = (await response.json()) as {
          questions?: Question[];
          answered?: AnsweredMap;
          last_completed_at?: string | null;
        };
        const questions = Array.isArray(payload.questions)
          ? payload.questions
          : [];
        setSnapshotQuestions(questions.length > 0 ? questions : null);
        setAnsweredMap(
          payload.answered && typeof payload.answered === "object"
            ? payload.answered
            : {},
        );
        setAssignmentRunAfter(
          typeof payload.last_completed_at === "string"
            ? payload.last_completed_at
            : null,
        );
      } catch {
        setSnapshotQuestions(null);
        setAnsweredMap({});
        setAssignmentRunAfter(null);
      } finally {
        setIsSnapshotLoading(false);
      }
    };
    void loadSnapshot();
  }, [assignmentIdParam]);

  if (!isLoaded || isSnapshotLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  let filteredQuestions = snapshotQuestions ?? visibleQuestions;
  let topicName: string | undefined;
  let selectedTopics: string[] = [];
  let selectedQuestionIds: string[] = [];
  let requestedQuestionCount: number | undefined;
  const hasAssignmentSnapshot =
    Boolean(assignmentIdParam) && Array.isArray(snapshotQuestions);

  if (!hasAssignmentSnapshot && questionIdsParam) {
    const decodedQuestionIds = questionIdsParam
      .split(",")
      .map((id) => safeDecode(id).trim())
      .filter(Boolean);

    selectedQuestionIds = Array.from(new Set(decodedQuestionIds));
    if (selectedQuestionIds.length > 0) {
      const selectedQuestionIdSet = new Set(selectedQuestionIds);
      filteredQuestions = filteredQuestions.filter((question) =>
        selectedQuestionIdSet.has(question.id),
      );
      topicName =
        selectedQuestionIds.length === 1
          ? "1 review question"
          : `${selectedQuestionIds.length} review questions`;
    }
  }

  if (!hasAssignmentSnapshot && topicsParam) {
    const decodedTopics = topicsParam
      .split(",")
      .map((topic) => safeDecode(topic).trim())
      .filter(Boolean);
    selectedTopics = Array.from(new Set(decodedTopics));
    if (selectedTopics.length > 0) {
      filteredQuestions = filteredQuestions.filter((question) =>
        selectedTopics.some((selection) => {
          // Standard ID selection (e.g. "3.1.9-12.A") — match directly
          if (getStandardById(selection)) {
            return question.standardId === selection;
          }

          const match = selection.match(MODULE_CATEGORY_TOPIC_PATTERN);
          if (!match) {
            return question.topic === selection;
          }

          const moduleCode = match[1] as ModuleCode | undefined;
          const category = match[2]?.trim();
          if (!category) return false;

          const expectedModuleNumber =
            moduleCode === "A" ? 1 : moduleCode === "B" ? 2 : undefined;

          if (
            expectedModuleNumber !== undefined &&
            question.module !== expectedModuleNumber
          ) {
            return false;
          }

          const standard =
            typeof question.standardId === "string"
              ? getStandardById(question.standardId)
              : undefined;

          return standard?.category === category;
        }),
      );
      topicName =
        selectedTopics.length === 1
          ? (getStandardById(selectedTopics[0])?.id ?? selectedTopics[0])
          : undefined;
    }
  }

  if (questionsParam) {
    const parsed = parseInt(questionsParam, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      requestedQuestionCount = parsed;
    }
  }

  if (
    normalizedModeParam &&
    !VALID_MODES.includes(normalizedModeParam as PracticeModeType)
  ) {
    return <InvalidParamsMessage message={`Invalid mode: "${modeParam}". Please select a valid mode.`} />;
  }

  if (normalizedModeParam === "practice") {
    topicName = undefined;
  }

  if (
    !hasAssignmentSnapshot &&
    filteredQuestions.length === 0 &&
    normalizedModeParam &&
    VALID_MODES.includes(normalizedModeParam as PracticeModeType)
  ) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="max-w-md text-center rounded-xl border border-primary/30 bg-surface p-8 shadow-sm">
          <p className="text-slate-gray mb-2 font-medium">No questions available</p>
          <p className="text-sm text-muted-foreground">
            {role === "student"
              ? "Your teacher has not published any question sets for Self Practice yet, or none match this topic. Check back later or ask your teacher."
              : "No generated question sets are loaded. Add questions from Content management or check your connection."}
          </p>
          <Link
            href="/"
            className="inline-flex mt-6 items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium bg-primary hover:bg-primary-hover"
          >
            <Home className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const assignmentCompletionCallback = assignmentIdParam?.trim()
    ? handleAllSchoolAssignmentsCompleted
    : undefined;

  // Entry point decides where "Back" leads: assignment runs come from
  // My Assignment, everything else from Self Practice.
  const runBackHref = assignmentIdParam?.trim() ? "/assignments" : "/self-practice";

  switch (normalizedModeParam) {
    case "practice":
      return (
        <AdaptivePracticeMode
          questions={filteredQuestions}
          topicName={topicName}
          questionCount={requestedQuestionCount}
          assignmentId={assignmentIdParam}
          backHref={runBackHref}
          showBackLink
          preferReviewTopicsCta={!hasAssignmentSnapshot && Boolean(questionIdsParam)}
          answered={hasAssignmentSnapshot ? answeredMap : undefined}
          assignmentRunAfter={hasAssignmentSnapshot ? assignmentRunAfter : undefined}
          onAllSchoolAssignmentsCompleted={assignmentCompletionCallback}
        />
      );
    case "exam": {
      // ExamMode still expects the legacy centered scroll container that the
      // /practice page used to provide; the shell-based modes manage their
      // own layout regions.
      return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 sm:pt-4 lg:pt-5 pb-1 sm:pb-2 lg:pb-3 h-full overflow-y-auto">
          <ExamMode
            questions={filteredQuestions}
            topicName={topicName}
            requestedQuestionCount={requestedQuestionCount ?? 10}
            assignmentId={assignmentIdParam}
            backHref={runBackHref}
            answered={hasAssignmentSnapshot ? answeredMap : undefined}
            assignmentRunAfter={hasAssignmentSnapshot ? assignmentRunAfter : undefined}
            onAllSchoolAssignmentsCompleted={assignmentCompletionCallback}
          />
        </div>
      );
    }
    case "review":
      return (
        <ReviewMode
          questions={filteredQuestions}
          topicName={topicName}
          assignmentId={assignmentIdParam}
          backHref={runBackHref}
          questionCount={requestedQuestionCount}
          onAllSchoolAssignmentsCompleted={assignmentCompletionCallback}
        />
      );
    default:
      return (
        <InvalidParamsMessage
          message="Choose standards and a mode from Self Practice before starting."
        />
      );
  }
}
