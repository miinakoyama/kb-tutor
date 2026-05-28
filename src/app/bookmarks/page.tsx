"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bookmark,
  ChevronDown,
  Trash2,
  Home,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { fetchBookmarkIds, removeBookmark } from "@/lib/storage";
import { useQuestions } from "@/hooks/useQuestions";
import type { Question } from "@/types/question";
import {
  calloutAmber,
  calloutAmberIcon,
  calloutAmberTitleUpper,
  calloutInfo,
  calloutInfoIcon,
  calloutInfoTitleUpper,
  calloutPrimary,
  calloutPrimaryBody,
  calloutPrimaryTitleUpper,
} from "@/lib/ui/status-badge-styles";

interface BookmarkedQuestion {
  question: Question;
  id: string;
}

export default function BookmarksPage() {
  const { visibleQuestions, isLoaded } = useQuestions();
  const [bookmarkedQuestions, setBookmarkedQuestions] = useState<BookmarkedQuestion[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    const load = async () => {
      const ids = await fetchBookmarkIds();
      const bookmarked = ids
        .map((id) => {
          const question = visibleQuestions.find((q) => q.id === id);
          return question ? { question, id } : null;
        })
        .filter((item): item is BookmarkedQuestion => item !== null);
      setBookmarkedQuestions(bookmarked);
    };
    void load();
  }, [isLoaded, visibleQuestions]);

  const handleRemoveBookmark = useCallback((questionId: string) => {
    removeBookmark(questionId);
    setBookmarkedQuestions((prev) => prev.filter((item) => item.id !== questionId));
    if (expandedId === questionId) {
      setExpandedId(null);
    }
  }, [expandedId]);

  const handleToggleExpand = useCallback((questionId: string) => {
    setExpandedId((prev) => (prev === questionId ? null : questionId));
  }, []);

  if (!isLoaded) {
    return (
      <main className="h-[calc(100vh-4rem)] lg:h-screen overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 h-full flex items-center justify-center">
          <div className="text-slate-gray">Loading...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-[calc(100vh-4rem)] lg:h-screen overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10 h-full flex flex-col">
        <div className="mb-6">
          <div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold font-heading text-heading">
                Bookmarks
              </h1>
              <p className="text-sm text-muted-foreground">
                {bookmarkedQuestions.length} question{bookmarkedQuestions.length !== 1 ? "s" : ""} saved
              </p>
            </div>
          </div>
        </div>

        {bookmarkedQuestions.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Bookmark className="w-16 h-16 text-slate-gray/20 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-gray mb-2">
                No bookmarked questions
              </h2>
              <p className="text-muted-foreground text-sm mb-6 max-w-sm">
                Bookmark questions during practice sessions to review them later.
              </p>
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-white font-medium bg-primary hover:bg-primary-hover transition-colors"
              >
                <Home className="w-4 h-4" />
                Start Practicing
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 pb-4">
            {bookmarkedQuestions.map(({ question, id }) => {
              const isExpanded = expandedId === id;

              return (
                <div
                  key={id}
                  className="rounded-xl border border-border-subtle bg-surface shadow-sm overflow-hidden"
                >
                  <div
                    onClick={() => handleToggleExpand(id)}
                    className="w-full text-left p-5 hover:bg-foreground/5 transition-colors cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleToggleExpand(id);
                      }
                    }}
                  >
                    <div className="flex items-start gap-4">
                      <ChevronDown
                        className={`w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5 transition-transform duration-200 ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-gray leading-relaxed">
                          {question.text}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-muted-foreground bg-slate-gray/5 px-2 py-1 rounded">
                            Module {question.module}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {question.topic}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveBookmark(id);
                        }}
                        className="p-2 rounded-lg text-slate-gray/30 hover:text-red-500 hover:bg-error-light transition-colors flex-shrink-0"
                        aria-label="Remove bookmark"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-5 border-t border-border-subtle">
                          <div className="mt-4 space-y-4">
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                Options
                              </p>
                              <div className="space-y-2">
                                {question.options.map((option) => {
                                  const isCorrect = option.id === question.correctOptionId;
                                  return (
                                    <div
                                      key={option.id}
                                      className={`p-3 rounded-lg border ${
                                        isCorrect
                                          ? "border-primary/30 bg-primary/5"
                                          : "border-border-subtle bg-slate-gray/5"
                                      }`}
                                    >
                                      <div className="flex items-start gap-3">
                                        <span
                                          className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                                            isCorrect
                                              ? "bg-primary text-white"
                                              : "bg-slate-gray/20 text-muted-foreground"
                                          }`}
                                        >
                                          {option.id.toUpperCase()}
                                        </span>
                                        <div className="flex-1">
                                          <p
                                            className={`text-sm ${
                                              isCorrect ? "text-slate-gray font-medium" : "text-slate-gray/80"
                                            }`}
                                          >
                                            {option.text}
                                          </p>
                                          {option.feedback && (
                                            <p className="text-xs text-muted-foreground mt-1">
                                              {option.feedback}
                                            </p>
                                          )}
                                        </div>
                                        {isCorrect && (
                                          <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {question.explanation && (
                              <div className={`p-4 ${calloutInfo}`}>
                                <div className="flex items-start gap-2">
                                  <CheckCircle2 className={`w-4 h-4 flex-shrink-0 mt-0.5 ${calloutInfoIcon}`} />
                                  <div>
                                    <p className={calloutInfoTitleUpper}>
                                      Explanation
                                    </p>
                                    <p className="text-sm text-slate-gray">
                                      {question.explanation}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {question.keyKnowledge && (
                              <div className={`p-4 ${calloutPrimary}`}>
                                <div className="flex items-start gap-2">
                                  <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                                  <div>
                                    <p className={calloutPrimaryTitleUpper}>
                                      Key Knowledge
                                    </p>
                                    <p className={calloutPrimaryBody}>
                                      {question.keyKnowledge}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {question.commonMisconception && (
                              <div className={`p-4 ${calloutAmber}`}>
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${calloutAmberIcon}`} />
                                  <div>
                                    <p className={calloutAmberTitleUpper}>
                                      Common Misconception
                                    </p>
                                    <p className="text-sm text-slate-gray">
                                      {question.commonMisconception}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
