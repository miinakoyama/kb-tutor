"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  Sparkles,
  Package,
  Search,
  Trash2,
  Plus,
} from "lucide-react";
import questionsData from "@/data/questions.json";
import questionSetsData from "@/data/question-sets.json";
import type { Question, QuestionSet, QuestionSource } from "@/types/question";
import {
  getAllGeneratedQuestionSets,
  deleteGeneratedQuestionSet,
} from "@/lib/question-storage";
import { getDefaultStandardForTopic } from "@/lib/standards";

const fileQuestions = (questionsData as Question[]).map((question) => {
  if (question.standardId) return question;
  const standard = getDefaultStandardForTopic(question.topic);
  return {
    ...question,
    standardId: standard.id,
    standardLabel: standard.label,
  };
});
const fileQuestionSets = questionSetsData as QuestionSet[];

export default function QuestionsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [localStorageData, setLocalStorageData] = useState<{
    questions: Question[];
    questionSets: QuestionSet[];
  }>({ questions: [], questionSets: [] });

  useEffect(() => {
    const data = getAllGeneratedQuestionSets();
    setLocalStorageData(data);
  }, []);

  const allQuestionSets = useMemo(() => {
    const sets = [...fileQuestionSets, ...localStorageData.questionSets];
    return sets;
  }, [localStorageData.questionSets]);

  const getQuestionCountForSet = (setId: string): number => {
    const localSet = localStorageData.questionSets.find((s) => s.id === setId);
    if (localSet) {
      return localStorageData.questions.filter(
        (q) => q.questionSetId === setId
      ).length;
    }
    return fileQuestions.filter((q) => q.questionSetId === setId).length;
  };

  const getVisibleCountForSet = (setId: string): number => {
    const localSet = localStorageData.questionSets.find((s) => s.id === setId);
    if (localSet) {
      return localStorageData.questions.filter(
        (q) => q.questionSetId === setId && q.isVisible !== false
      ).length;
    }
    return fileQuestions.filter(
      (q) => q.questionSetId === setId && q.isVisible !== false
    ).length;
  };

  const isLocalStorageSet = (setId: string): boolean => {
    return localStorageData.questionSets.some((s) => s.id === setId);
  };

  const filteredSets = useMemo(() => {
    if (!searchQuery.trim()) {
      return allQuestionSets.filter((set) => getQuestionCountForSet(set.id) > 0);
    }

    const query = searchQuery.toLowerCase();
    return allQuestionSets.filter((set) => {
      if (set.name.toLowerCase().includes(query)) return true;

      const questions = isLocalStorageSet(set.id)
        ? localStorageData.questions.filter((q) => q.questionSetId === set.id)
        : fileQuestions.filter((q) => q.questionSetId === set.id);

      return questions.some(
        (q) =>
          q.text.toLowerCase().includes(query) ||
          q.topic.toLowerCase().includes(query)
      );
    });
  }, [allQuestionSets, searchQuery, localStorageData]);

  const getSourceIcon = (source: QuestionSource) => {
    switch (source) {
      case "manual":
        return <FileText className="w-5 h-5 text-slate-gray/70" />;
      case "imported":
        return <Package className="w-5 h-5 text-slate-gray/70" />;
      case "generated":
        return <Sparkles className="w-5 h-5 text-[#16a34a]" />;
    }
  };

  const getSourceLabel = (source: QuestionSource) => {
    switch (source) {
      case "manual":
        return "Manual";
      case "imported":
        return "Imported";
      case "generated":
        return "AI Generated";
    }
  };

  const handleDeleteSet = (e: React.MouseEvent, setId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm("Delete this question set? This cannot be undone.")) {
      return;
    }
    deleteGeneratedQuestionSet(setId);
    setLocalStorageData((prev) => ({
      questions: prev.questions.filter((q) => q.questionSetId !== setId),
      questionSets: prev.questionSets.filter((s) => s.id !== setId),
    }));
  };

  const totalQuestionCount =
    fileQuestions.length + localStorageData.questions.length;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <Link
        href="/content"
        className="inline-flex items-center gap-2 text-base font-semibold text-[#14532d] hover:text-[#166534] transition-colors mb-6"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#16a34a]/10">
          <ArrowLeft className="w-4 h-4 text-[#14532d]" />
        </span>
        Back to Content Management
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-gray">Question Manager</h1>
          <p className="text-sm text-slate-gray/70">
            {totalQuestionCount} total questions in {filteredSets.length} set(s)
          </p>
        </div>
        <Link
          href="/content/mass-production"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-[#16a34a] hover:bg-[#15803d] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Generate New
        </Link>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-gray/40" />
          <input
            type="text"
            placeholder="Search question sets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-gray/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16a34a]/50 text-sm"
          />
        </div>
      </div>

      {/* Question Set List */}
      <div className="space-y-3">
        {filteredSets.map((set) => {
          const isLocal = isLocalStorageSet(set.id);
          const questionCount = getQuestionCountForSet(set.id);
          const visibleCount = getVisibleCountForSet(set.id);

          return (
            <Link
              key={set.id}
              href={`/content/questions/${encodeURIComponent(set.id)}`}
              className="block rounded-xl border border-[#16a34a]/30 bg-white p-4 shadow-sm hover:border-[#16a34a] hover:shadow-md transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg">
                    {getSourceIcon(set.source)}
                  </div>
                  <div>
                    <h2 className="font-medium text-slate-gray group-hover:text-[#16a34a] transition-colors">
                      {set.name}
                    </h2>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-slate-gray/60">
                        {questionCount} questions
                      </span>
                      {visibleCount !== questionCount && (
                        <span className="text-xs text-amber-600">
                          {visibleCount} visible
                        </span>
                      )}
                      <span className="text-xs text-[#16a34a] bg-[#16a34a]/10 px-2 py-0.5 rounded">
                        {getSourceLabel(set.source)}
                      </span>
                      {set.createdAt && (
                        <span className="text-xs text-slate-gray/50">
                          {new Date(set.createdAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isLocal && (
                    <button
                      onClick={(e) => handleDeleteSet(e, set.id)}
                      className="p-2 rounded-lg text-slate-gray/30 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete set"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <ChevronRight className="w-5 h-5 text-slate-gray/30 group-hover:text-[#16a34a] transition-colors" />
                </div>
              </div>
            </Link>
          );
        })}

        {filteredSets.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-gray/60 mb-4">
              {searchQuery
                ? "No question sets found matching your search."
                : "No question sets available."}
            </p>
            <Link
              href="/content/mass-production"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-[#16a34a] hover:bg-[#15803d] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Generate Questions
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
