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
          ? "border-green-500/50 bg-green-50"
          : "border-red-400/50 bg-red-50"
      }`}
    >
      <div className="flex items-start gap-3">
        {isCorrect ? (
          <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
        ) : (
          <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
        )}
        <div className="space-y-2">
          <p
            className={`font-medium ${
              isCorrect ? "text-green-800" : "text-red-800"
            }`}
          >
            {isCorrect ? "Correct!" : "Incorrect"}
          </p>
          <p className="text-slate-gray text-sm">{explanation}</p>
          {!isCorrect && commonMisconception && (
            <div className="rounded border border-amber-300/50 bg-amber-50 p-3 mt-2">
              <p className="text-xs font-medium text-amber-800 mb-1">
                Common Misconception
              </p>
              <p className="text-sm text-amber-900">{commonMisconception}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
