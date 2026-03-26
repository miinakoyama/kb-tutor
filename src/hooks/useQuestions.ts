"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import questionsData from "@/data/questions.json";
import type { Question } from "@/types/question";
import { getAllGeneratedQuestionSets } from "@/lib/question-storage";
import { getDefaultStandardForTopic } from "@/lib/standards";

const fileQuestions = questionsData as Question[];

function withStandard(question: Question): Question {
  if (question.standardId) {
    return question;
  }
  const standard = getDefaultStandardForTopic(question.topic);
  return {
    ...question,
    standardId: standard.id,
    standardLabel: standard.label,
  };
}

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
    return [...fileQuestions, ...localStorageQuestions].map(withStandard);
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
  return fileQuestions.filter((q) => q.isVisible !== false).map(withStandard);
}
