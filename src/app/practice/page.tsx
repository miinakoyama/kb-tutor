import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
  }

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-slate-gray hover:text-leaf transition-colors text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to topics
      </Link>

      <MCQEngine questions={filteredQuestions} />
    </div>
  );
}

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; topic?: string }>;
}) {
  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-gray mb-6">
        Practice Session
      </h1>
      <Suspense fallback={<div className="text-slate-gray">Loading...</div>}>
        <PracticeContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
