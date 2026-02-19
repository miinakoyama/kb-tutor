"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { FeedbackDisplay } from "./FeedbackDisplay";
import { HintLadder } from "./HintLadder";
import type { Question } from "@/types/question";

interface MCQEngineProps {
  questions: Question[];
  onComplete?: () => void;
}

export function MCQEngine({ questions, onComplete }: MCQEngineProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const question = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;

  const handleSubmit = () => {
    if (!selectedOptionId) return;
    setIsSubmitted(true);
  };

  const handleNext = () => {
    if (isLastQuestion) {
      setIsComplete(true);
      onComplete?.();
      return;
    }
    setCurrentIndex((i) => i + 1);
    setSelectedOptionId(null);
    setIsSubmitted(false);
  };

  if (isComplete) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-lg border border-leaf/30 bg-white p-8 text-center"
      >
        <p className="text-lg font-medium text-slate-gray mb-4">
          You&apos;ve completed all questions!
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-4 py-2.5 min-h-[44px] rounded-md bg-leaf text-white font-medium hover:bg-leaf/90 transition-colors"
        >
          Back to topics
        </Link>
      </motion.div>
    );
  }

  if (!question || questions.length === 0) {
    return (
      <div className="rounded-lg border border-leaf/30 bg-white p-8 text-center text-slate-gray">
        No questions available for this topic.
      </div>
    );
  }

  const isCorrect =
    isSubmitted && selectedOptionId === question.correctOptionId;

  return (
    <div className="space-y-6">
      <div className="text-sm text-slate-gray/80">
        Question {currentIndex + 1} of {questions.length}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={question.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="rounded-lg border border-leaf/30 bg-white p-4 sm:p-6 shadow-sm"
        >
          <div className="prose prose-sm max-w-none text-slate-gray mb-4">
            <p className="whitespace-pre-wrap">{question.text}</p>
          </div>

          {question.imageUrl && (
            <div className="my-4 rounded-lg overflow-hidden">
              <Image
                src={question.imageUrl}
                alt="Question illustration"
                width={600}
                height={400}
                className="object-contain"
              />
            </div>
          )}

          <div className="space-y-2">
            {question.options.map((opt) => {
              const isSelected = selectedOptionId === opt.id;
              const showCorrect =
                isSubmitted && opt.id === question.correctOptionId;
              const showWrong =
                isSubmitted &&
                isSelected &&
                opt.id !== question.correctOptionId;

              return (
                <button
                  key={opt.id}
                  onClick={() => !isSubmitted && setSelectedOptionId(opt.id)}
                  disabled={isSubmitted}
                  className={`w-full text-left px-4 py-3 min-h-[44px] rounded-lg border transition-colors break-words ${
                    isSubmitted
                      ? "cursor-default"
                      : "hover:border-leaf/50 cursor-pointer"
                  } ${
                    showCorrect
                      ? "border-green-500 bg-green-50"
                      : showWrong
                      ? "border-red-400 bg-red-50"
                      : isSelected
                      ? "border-leaf bg-leaf/10"
                      : "border-slate-gray/20"
                  }`}
                >
                  <span className="font-medium text-slate-gray">
                    {opt.id}.{" "}
                  </span>
                  <span className="text-slate-gray">{opt.text}</span>
                </button>
              );
            })}
          </div>

          {!isSubmitted ? (
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={!selectedOptionId}
                className="px-4 py-2.5 min-h-[44px] rounded-md bg-leaf text-white font-medium hover:bg-leaf/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Submit
              </button>
            </div>
          ) : (
            <>
              <FeedbackDisplay
                isCorrect={!!isCorrect}
                explanation={question.explanation}
                commonMisconception={question.commonMisconception}
              />
              <div className="mt-4">
                <button
                  onClick={handleNext}
                  className="px-4 py-2.5 min-h-[44px] rounded-md bg-leaf text-white font-medium hover:bg-leaf/90 transition-colors"
                >
                  {isLastQuestion ? "Finish" : "Next"}
                </button>
              </div>
            </>
          )}

          <HintLadder hints={question.hints} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
