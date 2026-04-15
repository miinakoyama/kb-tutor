"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Home } from "lucide-react";
import type { Question } from "@/types/question";
import { AdaptivePracticeMode } from "@/components/modes/AdaptivePracticeMode";
import {
  getIncorrectQuestionIds,
  syncAnswerHistoryFromDb,
} from "@/lib/storage";
import { shuffleArray } from "@/lib/array-utils";

const MAX_REVIEW_QUESTIONS = 10;

interface ReviewModeProps {
  questions: Question[];
  topicName?: string;
}

export function ReviewMode({ questions, topicName }: ReviewModeProps) {
  const [reviewQuestions, setReviewQuestions] = useState<Question[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const load = async () => {
      await syncAnswerHistoryFromDb();
      const incorrectIds = new Set(getIncorrectQuestionIds());
      const incorrectQuestions = questions.filter((q) => incorrectIds.has(q.id));
      setReviewQuestions(shuffleArray(incorrectQuestions).slice(0, MAX_REVIEW_QUESTIONS));
      setIsInitialized(true);
    };
    void load();
  }, [questions]);

  if (!isInitialized) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-slate-gray">Loading questions...</div>
      </div>
    );
  }

  if (reviewQuestions.length === 0) {
    return (
      <div className="max-w-lg mx-auto pt-8">
        <div className="rounded-xl border border-[#16a34a]/30 bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="w-12 h-12 text-[#16a34a] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-gray mb-2">
            Nothing to Review!
          </h2>
          <p className="text-sm text-slate-gray/60 mb-6">
            You haven&apos;t gotten any questions wrong yet, or you haven&apos;t
            practiced any questions. Try some practice first!
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium bg-[#16a34a] hover:bg-[#15803d] transition-colors"
          >
            <Home className="w-4 h-4" />
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AdaptivePracticeMode
      questions={reviewQuestions}
      topicName={topicName}
      questionCount={MAX_REVIEW_QUESTIONS}
      mode="review"
      backHref="/"
      showBackLink
    />
  );
}
