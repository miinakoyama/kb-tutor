import { Suspense } from "react";
import { MCQEngine } from "@/components/MCQEngine";
import questionsData from "@/data/questions.json";
import type { Question } from "@/types/question";

const questions = questionsData as Question[];

async function PracticeContent({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; topic?: string }>;
}) {
  const params = await searchParams;
  const moduleParam = params.module;
  const topicParam = params.topic;

  let filteredQuestions = questions;
  let topicName: string | undefined;

  if (moduleParam) {
    const moduleNum = parseInt(moduleParam, 10);
    if (!isNaN(moduleNum)) {
      filteredQuestions = filteredQuestions.filter(
        (q) => q.module === moduleNum
      );
    }
  }

  if (topicParam) {
    const decodedTopic = decodeURIComponent(topicParam);
    filteredQuestions = filteredQuestions.filter(
      (q) => q.topic === decodedTopic
    );
    topicName = decodedTopic;
  }

  return <MCQEngine questions={filteredQuestions} topicName={topicName} />;
}

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; topic?: string }>;
}) {
  return (
    <main className="h-[calc(100vh-4rem)] lg:h-screen overflow-hidden">
      <div className="max-w-4xl mx-auto px-4 py-4 h-full">
        <Suspense fallback={<div className="text-slate-gray">Loading...</div>}>
          <PracticeContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
