import Image from "next/image";
import { Check } from "lucide-react";
import type { Question } from "@/types/question";
import { DiagramRenderer } from "@/components/diagrams/DiagramRenderer";
import { AdaptiveDiagramViewport } from "@/components/diagrams/AdaptiveDiagramViewport";

interface QuestionDetailsProps {
  question: Question;
  className?: string;
}

/**
 * Read-only display of a question's answer options, diagram/image, and teacher
 * notes. Used in the existing-set picker and the assignment detail page.
 */
export function QuestionDetails({ question, className }: QuestionDetailsProps) {
  const hasVisual = Boolean(question.imageUrl) || Boolean(question.diagram);
  const hasTeacherNotes = Boolean(
    question.focusHint ?? question.keyKnowledge ?? question.commonMisconception,
  );

  return (
    <div
      className={`border-t border-slate-100 bg-slate-50/80 px-3 py-3 space-y-3 ${className ?? ""}`}
    >
      {hasVisual && (
        <div className="space-y-2">
          {question.imageUrl && (
            <div className="rounded-lg overflow-hidden border border-slate-200 bg-white">
              <Image
                src={question.imageUrl}
                alt="Question illustration"
                width={600}
                height={400}
                className="w-full object-contain max-h-64"
                unoptimized
              />
            </div>
          )}
          {question.diagram && (
            <AdaptiveDiagramViewport maxHeightClassName="max-h-72">
              <DiagramRenderer diagram={question.diagram} />
            </AdaptiveDiagramViewport>
          )}
        </div>
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-gray/70 mb-1.5">
          Answer options
        </p>
        <ul className="space-y-1.5">
          {question.options.map((option, index) => {
            const isCorrect = option.id === question.correctOptionId;
            return (
              <li
                key={option.id}
                className={`rounded-md border px-2.5 py-2 text-sm ${
                  isCorrect
                    ? "border-[#16a34a]/40 bg-[#16a34a]/5"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold flex-shrink-0 ${
                      isCorrect
                        ? "bg-[#16a34a] text-white"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {isCorrect ? <Check className="w-3 h-3" /> : index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-gray whitespace-pre-wrap">{option.text}</p>
                    {option.feedback && (
                      <p className="mt-1 text-xs text-slate-gray/70 whitespace-pre-wrap">
                        {option.feedback}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {hasTeacherNotes && (
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 space-y-1.5 text-xs text-slate-gray">
          {question.focusHint && (
            <p>
              <span className="font-semibold text-slate-gray/80">Focus hint:</span>{" "}
              {question.focusHint}
            </p>
          )}
          {question.keyKnowledge && (
            <p>
              <span className="font-semibold text-slate-gray/80">Key knowledge:</span>{" "}
              {question.keyKnowledge}
            </p>
          )}
          {question.commonMisconception && (
            <p>
              <span className="font-semibold text-slate-gray/80">
                Common misconception:
              </span>{" "}
              {question.commonMisconception}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
