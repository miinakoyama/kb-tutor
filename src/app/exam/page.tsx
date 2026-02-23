"use client";

import { ExamMode } from "@/components/modes/ExamMode";
import questionsData from "@/data/questions.json";
import type { Question } from "@/types/question";

const allQuestions = questionsData as Question[];

export default function ExamPage() {
  return (
    <main className="h-[calc(100vh-4rem)] lg:h-screen overflow-hidden">
      <div className="max-w-5xl mx-auto px-4 py-4 h-full overflow-y-auto">
        <ExamMode questions={allQuestions} topicName="Full Mock Exam" />
      </div>
    </main>
  );
}
