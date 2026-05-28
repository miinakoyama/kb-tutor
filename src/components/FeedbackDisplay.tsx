import { CheckCircle, XCircle } from "lucide-react";

interface FeedbackDisplayProps {
  isCorrect: boolean;
  explanation: string;
  commonMisconception?: string;
}

export function FeedbackDisplay({
  isCorrect,
  explanation,
  commonMisconception,
}: FeedbackDisplayProps) {
  return (
    <div
      className={`mt-4 rounded-lg border p-4 ${
        isCorrect
          ? "border-primary/40 bg-primary-light"
          : "border-error-border bg-error-light"
      }`}
    >
      <div className="flex items-start gap-3">
        {isCorrect ? (
          <CheckCircle className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
        ) : (
          <XCircle className="w-6 h-6 text-error flex-shrink-0 mt-0.5" />
        )}
        <div className="space-y-2">
          <p
            className={`font-medium ${
              isCorrect ? "text-forest" : "text-error"
            }`}
          >
            {isCorrect ? "Correct!" : "Incorrect"}
          </p>
          <p className="text-slate-gray text-sm">{explanation}</p>
          {!isCorrect && commonMisconception && (
            <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 mt-2">
              <p className="text-xs font-medium text-amber-400 mb-1">
                Common Misconception
              </p>
              <p className="text-sm text-slate-gray">{commonMisconception}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
