import { Suspense } from "react";
import Link from "next/link";
import { Home } from "lucide-react";
import { ModeSelector } from "@/components/ModeSelector";
import { GuidedMode } from "@/components/modes/GuidedMode";
import { PracticeMode } from "@/components/modes/PracticeMode";
import { ExamMode } from "@/components/modes/ExamMode";
import { ReviewMode } from "@/components/modes/ReviewMode";
import questionsData from "@/data/questions.json";
import type { Question, PracticeMode as PracticeModeType } from "@/types/question";
import { MODULES } from "@/types/question";

const questions = questionsData as Question[];

const VALID_MODES: PracticeModeType[] = ["guided", "practice", "exam", "review"];

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
  const decodedTopic = decodeURIComponent(topicParam);
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

async function PracticeContent({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; topic?: string; mode?: string; questions?: string }>;
}) {
  const params = await searchParams;
  const moduleParam = params.module;
  const topicParam = params.topic;
  const modeParam = params.mode as PracticeModeType | undefined;

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

  let filteredQuestions = questions;
  let topicName: string | undefined;

  if (moduleValidation.moduleNum !== undefined) {
    filteredQuestions = filteredQuestions.filter(
      (q) => q.module === moduleValidation.moduleNum
    );
  }

  if (topicValidation.decodedTopic) {
    filteredQuestions = filteredQuestions.filter(
      (q) => q.topic === topicValidation.decodedTopic
    );
    topicName = topicValidation.decodedTopic;
  }

  if (!modeParam && moduleValidation.moduleNum && topicName) {
    return (
      <ModeSelector
        moduleId={moduleValidation.moduleNum}
        topicName={topicName}
      />
    );
  }

  if (modeParam && !VALID_MODES.includes(modeParam)) {
    return <InvalidParamsMessage message={`Invalid mode: "${modeParam}". Please select a valid mode.`} />;
  }

  switch (modeParam) {
    case "guided":
      return (
        <GuidedMode questions={filteredQuestions} topicName={topicName} />
      );
    case "practice":
      return (
        <PracticeMode questions={filteredQuestions} topicName={topicName} />
      );
    case "exam": {
      return (
        <ExamMode
          questions={filteredQuestions}
          topicName={topicName ? `Topic Quiz: ${topicName}` : undefined}
          requestedQuestionCount={10}
        />
      );
    }
    case "review":
      return (
        <ReviewMode questions={questions} topicName={topicName} />
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

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; topic?: string; mode?: string; questions?: string }>;
}) {
  return (
    <main className="h-[calc(100vh-4rem)] lg:h-screen overflow-hidden">
      <div className="max-w-5xl mx-auto px-4 py-4 h-full overflow-y-auto">
        <Suspense fallback={<div className="text-slate-gray">Loading...</div>}>
          <PracticeContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
