"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Trash2,
  CheckSquare,
  Square,
  FileJson,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import questionsData from "@/data/questions.json";
import questionSetsData from "@/data/question-sets.json";
import type { Question, QuestionSet } from "@/types/question";
import { QuestionPreviewCard } from "@/components/mass-production/QuestionPreviewCard";
import { QuestionEditModal } from "@/components/mass-production/QuestionEditModal";
import { downloadAsJson, downloadAsTsv } from "@/lib/export-utils";
import {
  getGeneratedQuestionSetById,
  updateGeneratedQuestionInStorage,
  deleteGeneratedQuestionFromStorage,
  toggleQuestionVisibility,
  deleteGeneratedQuestionSet,
} from "@/lib/question-storage";

const fileQuestions = questionsData as Question[];
const fileQuestionSets = questionSetsData as QuestionSet[];

interface PageProps {
  params: Promise<{ setId: string }>;
}

export default function QuestionSetDetailPage({ params }: PageProps) {
  const { setId } = use(params);
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLocalStorage, setIsLocalStorage] = useState(false);

  const loadData = useCallback(() => {
    const decodedSetId = decodeURIComponent(setId);

    const fileSet = fileQuestionSets.find((s) => s.id === decodedSetId);
    if (fileSet) {
      const filteredQuestions = fileQuestions.filter(
        (q) => q.questionSetId === decodedSetId
      );
      setQuestionSet(fileSet);
      setQuestions(filteredQuestions);
      setSelectedIds(new Set(filteredQuestions.map((q) => q.id)));
      setIsLocalStorage(false);
      setIsLoading(false);
      return;
    }

    const { questions: localQuestions, questionSet: localSet } =
      getGeneratedQuestionSetById(decodedSetId);

    if (localSet) {
      setQuestionSet(localSet);
      setQuestions(localQuestions);
      setSelectedIds(new Set(localQuestions.map((q) => q.id)));
      setIsLocalStorage(true);
      setIsLoading(false);
      return;
    }

    router.push("/content/questions");
  }, [setId, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === questions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(questions.map((q) => q.id)));
    }
  };

  const handleDelete = (id: string) => {
    if (!isLocalStorage || !questionSet) {
      alert(
        "Cannot delete questions from file. Only generated questions can be deleted."
      );
      return;
    }

    deleteGeneratedQuestionFromStorage(questionSet.id, id);
    const updated = questions.filter((q) => q.id !== id);
    setQuestions(updated);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    if (updated.length === 0) {
      router.push("/content/questions");
    }
  };

  const handleDeleteSelected = () => {
    if (!isLocalStorage || !questionSet) {
      alert(
        "Cannot delete questions from file. Only generated questions can be deleted."
      );
      return;
    }
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected question(s)?`)) return;

    selectedIds.forEach((id) => {
      deleteGeneratedQuestionFromStorage(questionSet.id, id);
    });

    const updated = questions.filter((q) => !selectedIds.has(q.id));
    setQuestions(updated);
    setSelectedIds(new Set());

    if (updated.length === 0) {
      router.push("/content/questions");
    }
  };

  const handleDeleteAll = () => {
    if (!isLocalStorage || !questionSet) {
      alert(
        "Cannot delete questions from file. Only generated questions can be deleted."
      );
      return;
    }
    if (!confirm("Delete all questions in this set? This cannot be undone."))
      return;

    deleteGeneratedQuestionSet(questionSet.id);
    router.push("/content/questions");
  };

  const handleEdit = (question: Question) => {
    setEditingQuestion(question);
  };

  const handleSaveEdit = (updated: Question) => {
    if (isLocalStorage && questionSet) {
      updateGeneratedQuestionInStorage(questionSet.id, updated);
    }
    setQuestions((prev) =>
      prev.map((q) => (q.id === updated.id ? updated : q))
    );
    setEditingQuestion(null);
  };

  const handleToggleVisibility = (question: Question) => {
    if (!isLocalStorage || !questionSet) {
      alert("Cannot change visibility of questions from file.");
      return;
    }
    toggleQuestionVisibility(questionSet.id, question.id);
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === question.id
          ? { ...q, isVisible: q.isVisible === false ? true : false }
          : q
      )
    );
  };

  const handleDownloadJson = () => {
    const toDownload = questions.filter((q) => selectedIds.has(q.id));
    if (toDownload.length === 0) {
      alert("Please select at least one question to download.");
      return;
    }
    const filename = questionSet?.name
      ? questionSet.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()
      : `questions-${Date.now()}`;
    downloadAsJson(toDownload, filename);
  };

  const handleDownloadTsv = () => {
    const toDownload = questions.filter((q) => selectedIds.has(q.id));
    if (toDownload.length === 0) {
      alert("Please select at least one question to download.");
      return;
    }
    const filename = questionSet?.name
      ? questionSet.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()
      : `questions-${Date.now()}`;
    downloadAsTsv(toDownload, filename);
  };

  if (isLoading) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#16a34a] animate-spin" />
        </div>
      </main>
    );
  }

  if (!questionSet || questions.length === 0) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center py-16">
          <p className="text-slate-gray/70 mb-4">
            Question set not found or empty.
          </p>
          <Link
            href="/content/questions"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-[#16a34a] hover:bg-[#15803d]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Question Manager
          </Link>
        </div>
      </main>
    );
  }

  const visibleCount = questions.filter((q) => q.isVisible !== false).length;

  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <Link
        href="/content/questions"
        className="inline-flex items-center gap-2 text-base font-semibold text-[#14532d] hover:text-[#166534] transition-colors mb-6"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#16a34a]/10">
          <ArrowLeft className="w-4 h-4 text-[#14532d]" />
        </span>
        Back to Question Manager
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-gray">
            {questionSet.name}
          </h1>
          <p className="text-sm text-slate-gray/70">
            {questions.length} question(s) • {visibleCount} visible in tutor
            {selectedIds.size > 0 && ` • ${selectedIds.size} selected`}
          </p>
          {questionSet.createdAt && (
            <p className="text-xs text-slate-gray/50 mt-1">
              Created: {new Date(questionSet.createdAt).toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isLocalStorage && (
            <button
              onClick={handleDeleteAll}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Set
            </button>
          )}
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between mb-4 p-3 bg-slate-gray/5 rounded-lg">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSelectAll}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-gray hover:bg-white transition-colors"
          >
            {selectedIds.size === questions.length ? (
              <CheckSquare className="w-4 h-4" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            {selectedIds.size === questions.length
              ? "Deselect All"
              : "Select All"}
          </button>

          {isLocalStorage && selectedIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Selected
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadTsv}
            disabled={selectedIds.size === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-slate-gray/20 text-slate-gray hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            TSV
          </button>
          <button
            onClick={handleDownloadJson}
            disabled={selectedIds.size === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white bg-[#16a34a] hover:bg-[#15803d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FileJson className="w-4 h-4" />
            JSON
          </button>
        </div>
      </div>

      {/* Question List */}
      <div className="space-y-4 mb-8">
        {questions.map((question, index) => (
          <QuestionPreviewCard
            key={question.id}
            question={question}
            index={index}
            isSelected={selectedIds.has(question.id)}
            onToggleSelect={() => handleToggleSelect(question.id)}
            onEdit={() => handleEdit(question)}
            onDelete={() => handleDelete(question.id)}
            onToggleVisibility={
              isLocalStorage ? () => handleToggleVisibility(question) : undefined
            }
            isEditable={isLocalStorage}
          />
        ))}
      </div>

      {editingQuestion && (
        <QuestionEditModal
          question={editingQuestion}
          onSave={handleSaveEdit}
          onClose={() => setEditingQuestion(null)}
        />
      )}
    </main>
  );
}
