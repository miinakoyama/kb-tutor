"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import questionsData from "@/data/questions.json";
import type { Question } from "@/types/question";
import { getAllGeneratedQuestionSets } from "@/lib/question-storage";

const fileQuestions = questionsData as Question[];

export function useQuestions() {
  const [localStorageQuestions, setLocalStorageQuestions] = useState<Question[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const loadQuestions = useCallback(() => {
    const { questions } = getAllGeneratedQuestionSets();
    setLocalStorageQuestions(questions);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const allQuestions = useMemo(() => {
    return [...fileQuestions, ...localStorageQuestions];
  }, [localStorageQuestions]);

  const visibleQuestions = useMemo(() => {
    return allQuestions.filter((q) => q.isVisible !== false);
  }, [allQuestions]);

  return {
    allQuestions,
    visibleQuestions,
    isLoaded,
    reload: loadQuestions,
  };
}

export function getStaticQuestions(): Question[] {
  return fileQuestions.filter((q) => q.isVisible !== false);
}
