"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import type { Question, QuestionSet } from "@/types/question";
import { QuestionPreviewCard } from "@/components/mass-production/QuestionPreviewCard";
import { ShortAnswerPreviewCard } from "@/components/mass-production/ShortAnswerPreviewCard";
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

interface PageProps {
  params: Promise<{ setId: string }>;
}

export default function QuestionSetDetailPage({ params }: PageProps) {
  const { setId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const schoolIdFromQuery = searchParams.get("schoolId") ?? "";
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

  useEffect(() => {
    const editQuestionId = searchParams.get("edit");
    if (!editQuestionId || questions.length === 0) return;
    const target = questions.find((q) => q.id === editQuestionId);
    if (target) setEditingQuestion(target);
  }, [searchParams, questions]);

  const handleDelete = async (id: string) => {
    if (!isGeneratedFromDb || !questionSet) {
      alert("This question set is not available from the question service.");
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
      alert("This question set is not available from the question service.");
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
      <main className="mx-auto w-full max-w-[1500px] px-4 py-10 sm:px-6 sm:py-12 lg:px-10 lg:py-14 xl:px-12">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[var(--assignment-completed)] animate-spin" />
        </div>
      </main>
    );
  }

  if (!questionSet || questions.length === 0) {
    return (
      <main className="mx-auto w-full max-w-[1500px] px-4 py-10 sm:px-6 sm:py-12 lg:px-10 lg:py-14 xl:px-12">
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-4">
            Question set not found or empty.
          </p>
          <Link
            href="/content/questions"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-heading font-bold transition duration-200 hover:brightness-110 active:brightness-95 disabled:opacity-50 border-[1.5px] border-[var(--assignment-glass-border)] bg-[var(--assignment-cta-bg-strong)] text-[var(--assignment-cta-text)] shadow-[var(--assignment-cta-elevated-shadow)]"
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
    <main className="mx-auto w-full max-w-[1500px] px-4 py-10 sm:px-6 sm:py-12 lg:px-10 lg:py-14 xl:px-12">
      <Link
        href="/content/questions"
        className="inline-flex items-center gap-2 text-base font-semibold text-heading hover:text-forest transition-colors mb-6"
      >
        <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--assignment-calendar-nav-bg)]">
          <ArrowLeft className="w-4 h-4 text-heading" />
        </span>
        Back to Question Manager
      </Link>

      {actionError && (
        <div className="mb-4 rounded-xl border border-error-border bg-error-light px-3.5 py-2.5 text-sm text-error">
          {actionError}
        </div>
      )}

      <div className="flex items-start justify-between mb-6">
        <div>
          {isGeneratedFromDb && isEditingSetName ? (
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <input
                type="text"
                value={setNameDraft}
                onChange={(event) => setSetNameDraft(event.target.value)}
                className="min-w-[260px] max-w-xl w-full px-3 py-2 rounded-lg border border-border-default focus:outline-none focus:ring-2 focus:ring-[#16a34a]/40 text-base font-semibold text-slate-gray"
                placeholder="Question set name"
                disabled={isSavingSetName}
              />
              <button
                type="button"
                onClick={() => void handleSaveSetName()}
                disabled={isSavingSetName}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-full font-heading font-bold transition duration-200 hover:brightness-110 active:brightness-95 disabled:opacity-50 border-[1.5px] border-[var(--assignment-glass-border)] bg-[var(--assignment-cta-bg-strong)] text-[var(--assignment-cta-text)] shadow-[var(--assignment-cta-elevated-shadow)]"
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
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-border-default text-slate-gray hover:bg-foreground/5 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="font-heading text-xl font-bold text-slate-gray tracking-[-0.4px]">
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
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-border-default text-slate-gray hover:bg-foreground/5"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Rename
                </button>
              )}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {questions.length} question(s)
            {isGeneratedFromDb &&
              ` • ${selfPracticeCount} in Self Practice bank`}
          </p>
          {questionSet.createdAt && (
            <p className="text-xs text-muted-foreground mt-1">
              Created: {new Date(questionSet.createdAt).toLocaleString()}
            </p>
          )}
          {questionSet.generationModelLabel && (
            <p className="text-xs text-muted-foreground">
              Generated with: {questionSet.generationModelLabel}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isGeneratedFromDb && questionSet && (
            <Link
              href={
                schoolIdFromQuery
                  ? `/assignments/manage/new?setId=${encodeURIComponent(questionSet.id)}&schoolId=${encodeURIComponent(schoolIdFromQuery)}`
                  : `/assignments/manage/new?setId=${encodeURIComponent(questionSet.id)}`
              }
              className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-full font-heading font-bold transition duration-200 hover:brightness-110 active:brightness-95 disabled:opacity-50 border-[1.5px] border-[var(--assignment-glass-border)] bg-[var(--assignment-cta-bg-strong)] text-[var(--assignment-cta-text)] shadow-[var(--assignment-cta-elevated-shadow)]"
            >
              <ClipboardList className="w-4 h-4" />
              Create assignment from this set
            </Link>
          )}
          {isGeneratedFromDb && (
            <button
              onClick={handleDeleteAll}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-error hover:bg-error-light transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Set
            </button>
          )}
        </div>
      </div>

      {/* Export */}
      <div className="flex items-center justify-end mb-4 p-3 bg-slate-gray/5 rounded-lg">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadTsv}
            disabled={questions.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-border-default text-slate-gray hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            TSV
          </button>
          <button
            type="button"
            onClick={handleDownloadText}
            disabled={questions.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-border-default text-slate-gray hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FileText className="w-4 h-4" />
            TXT
          </button>
          <button
            type="button"
            onClick={handleDownloadJson}
            disabled={questions.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-border-default text-slate-gray hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FileJson className="w-4 h-4" />
            JSON
          </button>
        </div>
      </div>

      {/* Question List */}
      <div className="space-y-4 mb-8">
        {questions.map((question, index) =>
          question.questionType === "open-ended" && question.shortAnswer ? (
            <ShortAnswerPreviewCard
              key={question.id}
              question={question}
              item={question.shortAnswer}
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
          ) : (
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
          ),
        )}
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
