"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Trash2,
  FileJson,
  FileSpreadsheet,
  FileText,
  Loader2,
  Pencil,
  Check,
  X,
  ClipboardList,
} from "lucide-react";
import questionsData from "@/data/questions.json";
import questionSetsData from "@/data/question-sets.json";
import type { Question, QuestionSet } from "@/types/question";
import { QuestionPreviewCard } from "@/components/mass-production/QuestionPreviewCard";
import { QuestionEditModal } from "@/components/mass-production/QuestionEditModal";
import { downloadAsJson, downloadAsText, downloadAsTsv } from "@/lib/export-utils";
import {
  getGeneratedQuestionSetById,
  updateGeneratedQuestionInStorage,
  deleteGeneratedQuestionFromStorage,
  toggleIncludeInSelfPractice,
  deleteGeneratedQuestionSet,
  updateGeneratedQuestionSetName,
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

interface PageProps {
  params: Promise<{ setId: string }>;
}

export default function QuestionSetDetailPage({ params }: PageProps) {
  const { setId } = use(params);
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionSet, setQuestionSet] = useState<QuestionSet | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratedFromDb, setIsGeneratedFromDb] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isEditingSetName, setIsEditingSetName] = useState(false);
  const [setNameDraft, setSetNameDraft] = useState("");
  const [isSavingSetName, setIsSavingSetName] = useState(false);

  const loadData = useCallback(async () => {
    const decodedSetId = decodeURIComponent(setId);

    const fileSet = fileQuestionSets.find((s) => s.id === decodedSetId);
    if (fileSet) {
      const filteredQuestions = fileQuestions.filter(
        (q) => q.questionSetId === decodedSetId
      );
      setQuestionSet(fileSet);
      setQuestions(filteredQuestions);
      setIsGeneratedFromDb(false);
      setIsEditingSetName(false);
      setSetNameDraft(fileSet.name);
      setIsLoading(false);
      return;
    }

    const { questions: localQuestions, questionSet: localSet } =
      await getGeneratedQuestionSetById(decodedSetId);

    if (localSet) {
      setQuestionSet(localSet);
      setQuestions(localQuestions);
      setIsGeneratedFromDb(true);
      setIsEditingSetName(false);
      setSetNameDraft(localSet.name);
      setIsLoading(false);
      return;
    }

    router.push("/content/questions");
  }, [setId, router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleDelete = async (id: string) => {
    if (!isGeneratedFromDb || !questionSet) {
      alert(
        "Cannot delete questions from file. Only generated questions can be deleted."
      );
      return;
    }

    setActionError(null);
    try {
      await deleteGeneratedQuestionFromStorage(questionSet.id, id);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Failed to delete the question.",
      );
      return;
    }
    const updated = questions.filter((q) => q.id !== id);
    setQuestions(updated);

    if (updated.length === 0) {
      router.push("/content/questions");
    }
  };

  const handleDeleteAll = async () => {
    if (!isGeneratedFromDb || !questionSet) {
      alert(
        "Cannot delete questions from file. Only generated questions can be deleted."
      );
      return;
    }
    if (!confirm("Delete all questions in this set? This cannot be undone."))
      return;

    setActionError(null);
    try {
      await deleteGeneratedQuestionSet(questionSet.id);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Failed to delete questions.",
      );
      return;
    }
    router.push("/content/questions");
  };

  const handleEdit = (question: Question) => {
    setEditingQuestion(question);
  };

  const handleSaveEdit = async (updated: Question) => {
    const prev = questions.find((q) => q.id === updated.id);
    const merged: Question = {
      ...updated,
      includeInSelfPractice:
        updated.includeInSelfPractice ?? prev?.includeInSelfPractice,
    };
    if (isGeneratedFromDb && questionSet) {
      setActionError(null);
      try {
        await updateGeneratedQuestionInStorage(questionSet.id, merged);
      } catch (e) {
        setActionError(
          e instanceof Error ? e.message : "Failed to save the question.",
        );
        return;
      }
    }
    setQuestions((prevQs) =>
      prevQs.map((q) => (q.id === merged.id ? merged : q)),
    );
    setEditingQuestion(null);
  };

  const handleToggleIncludeInSelfPractice = async (question: Question) => {
    if (!isGeneratedFromDb || !questionSet) return;
    setActionError(null);
    try {
      const next = await toggleIncludeInSelfPractice(
        questionSet.id,
        question.id,
      );
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === question.id ? { ...q, includeInSelfPractice: next } : q,
        ),
      );
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Failed to update Self Practice.",
      );
    }
  };

  const handleDownloadJson = () => {
    if (questions.length === 0) {
      alert("No questions to download.");
      return;
    }
    const toDownload = questions;
    const filename = questionSet?.name
      ? questionSet.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()
      : `questions-${Date.now()}`;
    downloadAsJson(toDownload, filename);
  };

  const handleDownloadTsv = () => {
    if (questions.length === 0) {
      alert("No questions to download.");
      return;
    }
    const toDownload = questions;
    const filename = questionSet?.name
      ? questionSet.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()
      : `questions-${Date.now()}`;
    downloadAsTsv(toDownload, filename);
  };

  const handleDownloadText = () => {
    if (questions.length === 0) {
      alert("No questions to download.");
      return;
    }
    const toDownload = questions;
    const filename = questionSet?.name
      ? questionSet.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()
      : `questions-${Date.now()}`;
    downloadAsText(toDownload, filename);
  };

  const handleSaveSetName = async () => {
    if (!isGeneratedFromDb || !questionSet) return;
    setActionError(null);
    const trimmed = setNameDraft.trim();
    if (!trimmed) {
      setActionError("Question set name cannot be empty.");
      return;
    }
    if (trimmed === questionSet.name.trim()) {
      setIsEditingSetName(false);
      return;
    }
    setIsSavingSetName(true);
    try {
      const updatedName = await updateGeneratedQuestionSetName(questionSet.id, trimmed);
      setQuestionSet((prev) => (prev ? { ...prev, name: updatedName } : prev));
      setSetNameDraft(updatedName);
      setIsEditingSetName(false);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to update question set name.",
      );
    } finally {
      setIsSavingSetName(false);
    }
  };

  if (isLoading) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#16a34a] animate-spin" />
        </div>
      </main>
    );
  }

  if (!questionSet || questions.length === 0) {
    return (
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
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

  const selfPracticeCount = questions.filter((q) => q.includeInSelfPractice === true)
    .length;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <Link
        href="/content/questions"
        className="inline-flex items-center gap-2 text-base font-semibold text-[#14532d] hover:text-[#166534] transition-colors mb-6"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#16a34a]/10">
          <ArrowLeft className="w-4 h-4 text-[#14532d]" />
        </span>
        Back to Question Manager
      </Link>

      {actionError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {isGeneratedFromDb && isEditingSetName ? (
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <input
                type="text"
                value={setNameDraft}
                onChange={(event) => setSetNameDraft(event.target.value)}
                className="w-full sm:min-w-[260px] max-w-xl px-3 py-2 rounded-lg border border-slate-gray/20 focus:outline-none focus:ring-2 focus:ring-[#16a34a]/40 text-base font-semibold text-slate-gray"
                placeholder="Question set name"
                disabled={isSavingSetName}
              />
              <button
                type="button"
                onClick={() => void handleSaveSetName()}
                disabled={isSavingSetName}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white bg-[#16a34a] hover:bg-[#15803d] disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setSetNameDraft(questionSet.name);
                  setIsEditingSetName(false);
                  setActionError(null);
                }}
                disabled={isSavingSetName}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-slate-gray/20 text-slate-gray hover:bg-slate-gray/5 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          ) : (
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h1 className="break-words text-xl font-bold text-slate-gray">
                {questionSet.name}
              </h1>
              {isGeneratedFromDb && (
                <button
                  type="button"
                  onClick={() => {
                    setSetNameDraft(questionSet.name);
                    setIsEditingSetName(true);
                    setActionError(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-gray/20 text-slate-gray hover:bg-slate-gray/5"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Rename
                </button>
              )}
            </div>
          )}
          <p className="text-sm text-slate-gray/70">
            {questions.length} question(s)
            {isGeneratedFromDb &&
              ` • ${selfPracticeCount} in Self Practice bank`}
          </p>
          {questionSet.createdAt && (
            <p className="text-xs text-slate-gray/50 mt-1">
              Created: {new Date(questionSet.createdAt).toLocaleString()}
            </p>
          )}
          {questionSet.generationModelLabel && (
            <p className="text-xs text-slate-gray/50">
              Generated with: {questionSet.generationModelLabel}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isGeneratedFromDb && questionSet && (
            <Link
              href={`/assignments/manage/new?setId=${encodeURIComponent(questionSet.id)}`}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#16a34a] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#15803d]"
            >
              <ClipboardList className="w-4 h-4" />
              Create assignment from this set
            </Link>
          )}
          {isGeneratedFromDb && (
            <button
              onClick={handleDeleteAll}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete Set
            </button>
          )}
        </div>
      </div>

      {/* Export */}
      <div className="mb-4 rounded-lg bg-slate-gray/5 p-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleDownloadTsv}
            disabled={questions.length === 0}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-gray/20 px-3 py-2 text-sm text-slate-gray transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" />
            TSV
          </button>
          <button
            type="button"
            onClick={handleDownloadText}
            disabled={questions.length === 0}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-gray/20 px-3 py-2 text-sm text-slate-gray transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            TXT
          </button>
          <button
            type="button"
            onClick={handleDownloadJson}
            disabled={questions.length === 0}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-gray/20 px-3 py-2 text-sm text-slate-gray transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
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
            onEdit={() => handleEdit(question)}
            onDelete={() => handleDelete(question.id)}
            includeInSelfPractice={question.includeInSelfPractice}
            onToggleIncludeInSelfPractice={
              isGeneratedFromDb
                ? () => void handleToggleIncludeInSelfPractice(question)
                : undefined
            }
            isEditable={isGeneratedFromDb}
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
