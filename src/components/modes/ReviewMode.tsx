"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Home } from "lucide-react";
import type { Question } from "@/types/question";
import { AdaptivePracticeMode } from "@/components/modes/AdaptivePracticeMode";
import { fetchIncorrectQuestionIds } from "@/lib/storage";
import { shuffleArray } from "@/lib/array-utils";

const MAX_REVIEW_QUESTIONS = 10;

interface ReviewModeProps {
  questions: Question[];
  topicName?: string;
  /**
   * When set, this review run is an assignment. The caller (PracticePageClient)
   * has already asked the server to resolve the review question set for this
   * (assignment, student) — scoped by the assignment's review_standards /
   * review_topics and capped by max_questions. In that case we MUST NOT
   * re-filter by local `getIncorrectQuestionIds()` (whose data only reflects
   * this device's history), and we must forward the assignmentId so the
   * nested AdaptivePracticeMode emits the completion POST and records
   * attempts under the assignment.
   */
  assignmentId?: string;
  /** Hard cap on the review session size for non-assignment runs. */
  questionCount?: number;
}

export function ReviewMode({
  questions,
  topicName,
  assignmentId,
  questionCount,
}: ReviewModeProps) {
  const [reviewQuestions, setReviewQuestions] = useState<Question[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const isAssignmentRun = Boolean(assignmentId);

  useEffect(() => {
    const load = async () => {
      if (isAssignmentRun) {
        // Server already resolved + shuffled + capped for this student.
        setReviewQuestions(questions);
        setIsInitialized(true);
        return;
      }
      // DB is the source of truth for which questions the student got wrong;
      // localStorage is only used as an offline fallback inside the fetch.
      const incorrectIds = new Set(await fetchIncorrectQuestionIds());
      const incorrectQuestions = questions.filter((q) => incorrectIds.has(q.id));
      const cap = questionCount ?? MAX_REVIEW_QUESTIONS;
      setReviewQuestions(shuffleArray(incorrectQuestions).slice(0, cap));
      setIsInitialized(true);
    };
    void load();
  }, [questions, isAssignmentRun, questionCount]);

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
      questionCount={reviewQuestions.length || MAX_REVIEW_QUESTIONS}
      mode="review"
      backHref="/"
      showBackLink
      assignmentId={assignmentId}
      // Review sessions always start fresh (no resume), but AdaptivePracticeMode
      // uses `answered !== undefined` as the signal that this is an assignment
      // run (enables the completion POST). Pass an empty object for review.
      answered={isAssignmentRun ? {} : undefined}
    />
  );
}
