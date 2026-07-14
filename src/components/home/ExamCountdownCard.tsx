import { CalendarDays } from "lucide-react";
import {
  daysUntilExam,
  formatExamDate,
  type KeystoneExamInfo,
} from "@/lib/keystone-exam";

/**
 * Tall countdown card for the "Your progress" row. The urgency tones carry
 * over from the previous banner: green when far out, amber inside a month,
 * red inside a week.
 */
export function ExamCountdownCard({ exam }: { exam: KeystoneExamInfo }) {
  const days = daysUntilExam(exam.examDate);
  if (days === null || days < 0) return null;

  const tone = getCountdownTone(days);

  return (
    <section
      aria-label="Keystone exam countdown"
      className={`flex h-full flex-col rounded-[24px] border p-5 sm:p-6 ${tone.border} ${tone.bg}`}
      style={{ boxShadow: "var(--assignment-card-shadow)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`text-xs font-semibold uppercase tracking-wide ${tone.label}`}
        >
          Keystone Biology
        </span>
        <span
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--assignment-glass-border)",
          }}
          aria-hidden="true"
        >
          <CalendarDays className={`h-4 w-4 ${tone.icon}`} />
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center py-6">
        {days === 0 ? (
          <p
            className={`font-heading text-3xl font-extrabold ${tone.headline}`}
          >
            Exam day
          </p>
        ) : (
          <>
            <p
              className={`font-heading font-extrabold leading-none ${tone.headline}`}
              style={{ fontSize: 56, letterSpacing: -1 }}
            >
              {days}
            </p>
            <p
              className={`mt-1 font-heading text-xl font-bold ${tone.headline}`}
            >
              {days === 1 ? "day to go" : "days to go"}
            </p>
          </>
        )}
      </div>

      <div
        className="border-t pt-4"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <p className="text-xs text-muted-foreground">Exam date</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-gray">
          {formatExamDate(exam.examDate)}
        </p>
      </div>
    </section>
  );
}

type CountdownTone = {
  border: string;
  bg: string;
  label: string;
  headline: string;
  icon: string;
};

function getCountdownTone(days: number): CountdownTone {
  if (days <= 7) {
    return {
      border: "border-error-border",
      bg: "bg-gradient-to-b from-red-50 to-orange-50 dark:from-rose-950/50 dark:to-orange-950/40",
      label: "text-error",
      headline: "text-error",
      icon: "text-error",
    };
  }
  if (days <= 30) {
    return {
      border: "border-amber-300 dark:border-amber-700/40",
      bg: "bg-gradient-to-b from-amber-50 to-yellow-50 dark:from-amber-950/45 dark:to-amber-950/30",
      label: "text-amber-700 dark:text-amber-300",
      headline: "text-amber-700 dark:text-amber-200",
      icon: "text-amber-600 dark:text-amber-300",
    };
  }
  return {
    border: "border-primary/40 dark:border-primary-border",
    bg: "bg-gradient-to-b from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-emerald-950/30",
    label: "text-primary-hover dark:text-forest",
    headline: "text-heading",
    icon: "text-primary",
  };
}
