"use client";

import { ExamMode } from "@/components/modes/ExamMode";
import { useQuestions } from "@/hooks/useQuestions";
import { Loader2 } from "lucide-react";

export default function ExamPage() {
  const { visibleQuestions, isLoaded } = useQuestions();

  if (!isLoaded) {
    return (
      <main className="h-[calc(100vh-4rem)] lg:h-screen overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 h-full flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-[#16a34a] animate-spin" />
        </div>
      </main>
    );
  }

  return (
    <main className="h-[calc(100vh-4rem)] lg:h-screen overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 h-full overflow-y-auto">
        <ExamMode questions={visibleQuestions} topicName="Full Mock Exam" />
      </div>
    </main>
  );
}
