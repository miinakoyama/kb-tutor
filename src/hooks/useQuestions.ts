"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { Question } from "@/types/question";
import { resolveRole } from "@/lib/auth/role";
import type { AppRole } from "@/lib/auth/types";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getAllGeneratedQuestionSets,
  migrateGeneratedSetsToDbOnce,
} from "@/lib/question-storage";
import { fetchStudentSelfPracticeQuestions } from "@/lib/school-generated-questions";
import { getDefaultStandardForTopic } from "@/lib/standards";
import { filterRenderableQuestions } from "@/lib/short-answer/question-guards";

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
  const [dynamicQuestions, setDynamicQuestions] = useState<Question[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [role, setRole] = useState<AppRole | null>(null);

  const loadQuestions = useCallback(async () => {
    if (typeof window === "undefined") return;

    if (process.env.NEXT_PUBLIC_E2E_AUTH_BYPASS === "1") {
      try {
        const response = await fetch("/api/e2e/questions", { cache: "no-store" });
        const payload = (await response.json()) as { questions?: Question[] };
        setRole("student");
        setDynamicQuestions(
          filterRenderableQuestions(payload.questions ?? []).map(withStandard),
        );
      } catch {
        setRole("student");
        setDynamicQuestions([]);
      } finally {
        setIsLoaded(true);
      }
      return;
    }

    if (!hasSupabaseEnv()) {
      setRole(null);
      setDynamicQuestions([]);
      setIsLoaded(true);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setRole(null);
      setDynamicQuestions([]);
      setIsLoaded(true);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const resolved = resolveRole(profile?.role, user) ?? "student";
    setRole(resolved);

    await migrateGeneratedSetsToDbOnce();

    if (resolved === "student") {
      const { questions } = await fetchStudentSelfPracticeQuestions(supabase);
      setDynamicQuestions(filterRenderableQuestions(questions).map(withStandard));
    } else {
      const { questions } = await getAllGeneratedQuestionSets();
      setDynamicQuestions(filterRenderableQuestions(questions).map(withStandard));
    }

    setIsLoaded(true);
  }, []);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  const allQuestions = useMemo(() => {
    if (role === "student") {
      return dynamicQuestions.map(withStandard);
    }
    return dynamicQuestions.map(withStandard);
  }, [role, dynamicQuestions]);

  /** Same as `allQuestions`; visibility is controlled only via Self Practice inclusion for generated sets. */
  const visibleQuestions = useMemo(() => allQuestions, [allQuestions]);

  return {
    allQuestions,
    visibleQuestions,
    isLoaded,
    reload: loadQuestions,
    role,
  };
}
