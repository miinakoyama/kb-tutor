import { Suspense } from "react";
import { PracticePageClient } from "@/components/PracticePageClient";

async function PracticeContent({
  searchParams,
}: {
  searchParams: Promise<{
    module?: string;
    topic?: string;
    topics?: string;
    mode?: string;
    questions?: string;
    assignmentId?: string;
  }>;
}) {
  const params = await searchParams;
  
  return (
    <PracticePageClient
      moduleParam={params.module}
      topicParam={params.topic}
      topicsParam={params.topics}
      modeParam={params.mode}
      questionsParam={params.questions}
      assignmentIdParam={params.assignmentId}
    />
  );
}

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{
    module?: string;
    topic?: string;
    topics?: string;
    mode?: string;
    questions?: string;
    assignmentId?: string;
  }>;
}) {
  return (
    <main className="h-[calc(100vh-4rem)] lg:h-screen overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 h-full overflow-y-auto">
        <Suspense fallback={<div className="text-slate-gray">Loading...</div>}>
          <PracticeContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
