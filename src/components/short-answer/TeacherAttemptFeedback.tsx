import type { GradedFeedback } from "@/types/short-answer";

interface TeacherAttemptFeedbackProps {
  feedback: GradedFeedback | null;
}

/** Compact feedback detail for teacher/admin attempt inspection surfaces. */
export function TeacherAttemptFeedback({
  feedback,
}: TeacherAttemptFeedbackProps) {
  if (!feedback || (feedback.segments.length === 0 && !feedback.modelAnswer)) {
    return null;
  }

  return (
    <div className="mt-2 space-y-1 border-t border-border-default pt-2">
      {feedback.segments.map((segment, index) => (
        <p key={index} className="text-xs text-slate-gray/70">
          {segment.label.trim().length > 0 && (
            <>
              <span className="font-semibold uppercase tracking-wide text-slate-gray/50">
                {segment.label}:
              </span>{" "}
            </>
          )}
          {segment.text}
        </p>
      ))}
      {feedback.modelAnswer && (
        <div className="mt-2 border-t border-border-subtle pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-gray/50">
            Model answer
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-gray/70">
            {feedback.modelAnswer}
          </p>
        </div>
      )}
    </div>
  );
}
