import { Suspense } from "react";
import { PracticePageClient } from "@/components/PracticePageClient";

async function PracticeContent({
  searchParams,
}: {
  searchParams: Promise<{
    topics?: string;
    mode?: string;
    questions?: string;
    questionIds?: string;
    assignmentId?: string;
    questionType?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <PracticePageClient
      topicsParam={params.topics}
      modeParam={params.mode}
      questionsParam={params.questions}
      questionIdsParam={params.questionIds}
      assignmentIdParam={params.assignmentId}
      questionTypeParam={params.questionType}
    />
  );
}

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{
    topics?: string;
    mode?: string;
    questions?: string;
    questionIds?: string;
    assignmentId?: string;
    questionType?: string;
  }>;
}) {
  return (
    <main className="h-[calc(100dvh-4rem)] lg:h-dvh overflow-hidden">
      <Suspense
        fallback={
          <div className="h-full flex items-center justify-center text-slate-gray">
            Loading...
          </div>
        }
      >
        <PracticeContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
