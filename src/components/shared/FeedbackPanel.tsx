"use client";

import { motion } from "framer-motion";
import { CheckCircle2, XCircle } from "lucide-react";
import type { Question, AnswerRecord } from "@/types/question";
import { useTextToSpeech, type ReadSection } from "@/hooks/useTextToSpeech";
import { buildFeedbackReadText } from "@/lib/tts-utils";
import { ReadAloudButton } from "./ReadAloudButton";

interface FeedbackPanelProps {
  question: Question;
  answer: AnswerRecord;
  showKeyKnowledge?: boolean;
  showMisconception?: boolean;
  showFocusHint?: boolean;
  feedbackReadText?: string;
  onReadAloud?: (section: ReadSection) => void;
  /**
   * "tinted" (default) keeps the legacy green/red panel background.
   * "neutral" renders on a muted neutral surface so the panel stays
   * subordinate to the selected answer — correctness is signalled by the
   * icon and title color only.
   */
  variant?: "tinted" | "neutral";
}

export function FeedbackPanel({
  question,
  answer,
  showKeyKnowledge = false,
  showMisconception = false,
  showFocusHint = false,
  feedbackReadText,
  onReadAloud,
  variant = "tinted",
}: FeedbackPanelProps) {
  const {
    isSupported,
    isSpeaking,
    currentSection,
    toggleSpeak,
  } = useTextToSpeech();

  const selectedOption = question.options.find(
    (opt) => opt.id === answer.selectedOptionId
  );
  const correctOption = question.options.find(
    (opt) => opt.id === question.correctOptionId
  );
  const isCorrect = answer.selectedOptionId === question.correctOptionId;

  const displayOption = selectedOption || correctOption;
  const displayIsCorrect = selectedOption ? isCorrect : true;

  const cleanFeedback = (feedback?: string) => {
    if (!feedback) return "";
    return feedback
      .replace(/^(Correct\.|Incorrect\.)\s*/i, "")
      .trim();
  };

  const fallbackFeedbackReadText = buildFeedbackReadText(question, answer, {
    includeKeyKnowledge: showKeyKnowledge,
    includeMisconception: showMisconception,
  });

  const resolvedFeedbackReadText =
    feedbackReadText && feedbackReadText.trim().length > 0
      ? feedbackReadText
      : fallbackFeedbackReadText;

  const feedbackReadTextWithFocusHint =
    !displayIsCorrect && showFocusHint && question.focusHint
      ? `${resolvedFeedbackReadText} Focus hint. ${question.focusHint}`.trim()
      : resolvedFeedbackReadText;

  const detailItems: Array<{ label: string; content: string }> = [];

  if (showKeyKnowledge && question.keyKnowledge) {
    detailItems.push({ label: "KEY IDEA:", content: question.keyKnowledge });
  }

  if (!displayIsCorrect && showFocusHint && question.focusHint) {
    detailItems.push({ label: "FOCUS HINT:", content: question.focusHint });
  }

  if (!displayIsCorrect && showMisconception && question.commonMisconception) {
    detailItems.push({
      label: "COMMON MISCONCEPTION:",
      content: question.commonMisconception,
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`space-y-3 ${variant === "neutral" ? "" : "mt-5"}`}
    >
      <div
        className={`p-4 rounded-2xl border ${
          variant === "neutral"
            ? "border-[var(--border-subtle)] bg-[var(--surface-muted)]"
            : displayIsCorrect
              ? "border-[var(--assignment-completed-muted)] bg-[var(--mastery-mastered-bg)]"
              : "border-error-border bg-error-light"
        }`}
      >
        <div className="flex items-start gap-3">
          {displayIsCorrect ? (
            <CheckCircle2
              className="w-5 h-5 flex-shrink-0 mt-0.5"
              style={{ color: "var(--mastery-mastered)" }}
            />
          ) : (
            <XCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <div className="mb-1 flex items-start justify-between gap-2">
              <p
                className="text-sm font-semibold"
                style={{ color: displayIsCorrect ? "var(--mastery-mastered)" : "var(--error-color)" }}
              >
                {displayIsCorrect ? "Correct!" : "Incorrect"}
              </p>
              {isSupported && feedbackReadTextWithFocusHint ? (
                <ReadAloudButton
                  section="feedback"
                  label="Feedback"
                  text={feedbackReadTextWithFocusHint}
                  isSpeaking={isSpeaking}
                  currentSection={currentSection}
                  onToggle={toggleSpeak}
                  onPlay={onReadAloud}
                  iconOnly
                />
              ) : null}
            </div>
            <p className="text-sm text-slate-gray leading-relaxed">
              {cleanFeedback(displayOption?.feedback)}
            </p>
            {detailItems.length > 0 && (
              <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-slate-gray leading-relaxed">
                {detailItems.map((item) => (
                  <li key={item.label}>
                    <span className="font-semibold">{item.label}</span> {item.content}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
