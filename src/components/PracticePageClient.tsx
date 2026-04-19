"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Home, Loader2 } from "lucide-react";
import { ModeSelector } from "@/components/ModeSelector";
import { AdaptivePracticeMode } from "@/components/modes/AdaptivePracticeMode";
import { ExamMode } from "@/components/modes/ExamMode";
import { ReviewMode } from "@/components/modes/ReviewMode";
import { useQuestions } from "@/hooks/useQuestions";
import type {
  PracticeMode as PracticeModeType,
  Question,
} from "@/types/question";
import { MODULES } from "@/types/question";
import { getStandardById, type ModuleCode } from "@/lib/standards";

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
  moduleParam?: string;
  topicParam?: string;
  topicsParam?: string;
  modeParam?: string;
  questionsParam?: string;
  assignmentIdParam?: string;
}

function InvalidParamsMessage({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="rounded-xl border border-[#16a34a]/30 bg-white p-8 text-center max-w-md">
        <p className="text-slate-gray mb-4">{message}</p>
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-lg text-white font-medium transition-colors bg-[#16a34a] hover:bg-[#15803d] focus-visible:bg-[#15803d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16a34a]/50"
        >
          <Home className="w-4 h-4" />
          Back to Home
        </Link>
      </div>
    </div>
  );
}

function validateModuleParam(moduleParam: string | undefined): {
  isValid: boolean;
  moduleNum?: number;
  error?: string;
} {
  if (!moduleParam) return { isValid: true };
  const moduleNum = parseInt(moduleParam, 10);
  if (isNaN(moduleNum)) {
    return {
      isValid: false,
      error: `Invalid module parameter: "${moduleParam}". Please select a valid module from the home page.`,
    };
  }
  const validModuleIds = MODULES.map((m) => m.id) as readonly number[];
  if (!validModuleIds.includes(moduleNum)) {
    return {
      isValid: false,
      error: `Module ${moduleNum} does not exist. Available modules: ${validModuleIds.join(", ")}.`,
    };
  }
  return { isValid: true, moduleNum };
}

function validateTopicParam(
  topicParam: string | undefined,
  moduleNum: number | undefined
): {
  isValid: boolean;
  decodedTopic?: string;
  error?: string;
} {
  if (!topicParam) return { isValid: true };
  const decodedTopic = safeDecode(topicParam);
  if (moduleNum !== undefined) {
    const targetModule = MODULES.find((m) => m.id === moduleNum);
    const topics = targetModule?.topics as readonly string[] | undefined;
    if (topics && !topics.includes(decodedTopic)) {
      return {
        isValid: false,
        error: `Topic "${decodedTopic}" is not available in Module ${moduleNum}. Please select a valid topic from the home page.`,
      };
    }
  }
  return { isValid: true, decodedTopic };
}

export function PracticePageClient({
  moduleParam,
  topicParam,
  topicsParam,
  modeParam,
  questionsParam,
  assignmentIdParam,
}: PracticePageClientProps) {
  const normalizedModeParam =
    modeParam === "adaptive" ? "practice" : modeParam;
  const { visibleQuestions, isLoaded, role } = useQuestions();
  const [snapshotQuestions, setSnapshotQuestions] = useState<Question[] | null>(
    null
  );
  const [answeredMap, setAnsweredMap] = useState<AnsweredMap>({});
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(false);

  useEffect(() => {
    const assignmentId = assignmentIdParam?.trim();
    if (!assignmentId) {
      setSnapshotQuestions(null);
      setAnsweredMap({});
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
          setIsSnapshotLoading(false);
          return;
        }
        const payload = (await response.json()) as {
          questions?: Question[];
          answered?: AnsweredMap;
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
      } catch {
        setSnapshotQuestions(null);
        setAnsweredMap({});
      } finally {
        setIsSnapshotLoading(false);
      }
    };
    void loadSnapshot();
  }, [assignmentIdParam]);

  if (!isLoaded || isSnapshotLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#16a34a] animate-spin" />
      </div>
    );
  }

  const moduleValidation = validateModuleParam(moduleParam);
  if (!moduleValidation.isValid) {
    return <InvalidParamsMessage message={moduleValidation.error!} />;
  }

  const topicValidation = validateTopicParam(
    topicParam,
    moduleValidation.moduleNum
  );
  if (!topicValidation.isValid) {
    return <InvalidParamsMessage message={topicValidation.error!} />;
  }

  let filteredQuestions = snapshotQuestions ?? visibleQuestions;
  let topicName: string | undefined;
  let selectedTopics: string[] = [];
  let requestedQuestionCount: number | undefined;
  const hasAssignmentSnapshot =
    Boolean(assignmentIdParam) && Array.isArray(snapshotQuestions);

  if (!hasAssignmentSnapshot && moduleValidation.moduleNum !== undefined) {
    filteredQuestions = filteredQuestions.filter(
      (q) => q.module === moduleValidation.moduleNum
    );
  }

  if (!hasAssignmentSnapshot && topicValidation.decodedTopic) {
    filteredQuestions = filteredQuestions.filter(
      (q) => q.topic === topicValidation.decodedTopic
    );
    topicName = topicValidation.decodedTopic;
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
          ? selectedTopics[0]
          : `${selectedTopics.length} selected areas`;
    }
  }

  if (questionsParam) {
    const parsed = parseInt(questionsParam, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      requestedQuestionCount = parsed;
    }
  }

  if (!modeParam && moduleValidation.moduleNum && topicName) {
    return (
      <ModeSelector
        moduleId={moduleValidation.moduleNum}
        topicName={topicName}
      />
    );
  }

  if (
    normalizedModeParam &&
    !VALID_MODES.includes(normalizedModeParam as PracticeModeType)
  ) {
    return <InvalidParamsMessage message={`Invalid mode: "${modeParam}". Please select a valid mode.`} />;
  }

  if (
    !hasAssignmentSnapshot &&
    filteredQuestions.length === 0 &&
    normalizedModeParam &&
    VALID_MODES.includes(normalizedModeParam as PracticeModeType)
  ) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="max-w-md text-center rounded-xl border border-[#16a34a]/30 bg-white p-8 shadow-sm">
          <p className="text-slate-gray mb-2 font-medium">No questions available</p>
          <p className="text-sm text-slate-gray/70">
            {role === "student"
              ? "Your teacher has not published any question sets for Self Practice yet, or none match this topic. Check back later or ask your teacher."
              : "No generated question sets are loaded. Add questions from Content management or check your connection."}
          </p>
          <Link
            href="/"
            className="inline-flex mt-6 items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium bg-[#16a34a] hover:bg-[#15803d]"
          >
            <Home className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  switch (normalizedModeParam) {
    case "practice":
      return (
        <AdaptivePracticeMode
          questions={filteredQuestions}
          topicName={topicName}
          questionCount={requestedQuestionCount}
          assignmentId={assignmentIdParam}
          answered={hasAssignmentSnapshot ? answeredMap : undefined}
        />
      );
    case "exam": {
      return (
        <ExamMode
          questions={filteredQuestions}
          topicName={topicName ? `Topic Quiz: ${topicName}` : undefined}
          requestedQuestionCount={requestedQuestionCount ?? 10}
          assignmentId={assignmentIdParam}
          answered={hasAssignmentSnapshot ? answeredMap : undefined}
        />
      );
    }
    case "review":
      return (
        <ReviewMode questions={filteredQuestions} topicName={topicName} />
      );
    default:
      return (
        <ModeSelector
          moduleId={moduleValidation.moduleNum ?? 1}
          topicName={topicName ?? "All Topics"}
        />
      );
  }
}
