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
  }>;
}) {
  return (
    <main className="h-[calc(100vh-4rem)] lg:h-screen overflow-hidden">
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
