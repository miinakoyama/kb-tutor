import { GraduationCap, History, NotebookPen } from "lucide-react";

type AssignmentMode = "practice" | "exam" | "review";

interface AssignmentModeBadgeProps {
  mode: AssignmentMode;
  size?: "sm" | "xs";
}

const MODE_META: Record<
  AssignmentMode,
  {
    label: string;
    icon: typeof NotebookPen;
    classes: string;
    title: string;
  }
> = {
  // Sky = calm/learning. Intentionally distinct from the brand green used for
  // the "Assignment" chip so the two don't blur together visually.
  practice: {
    label: "Practice",
    icon: NotebookPen,
    classes:
      "text-sky-800 bg-sky-100 dark:text-sky-200/90 dark:bg-sky-950/45 dark:ring-1 dark:ring-sky-800/35",
    title:
      "Practice mode: hints appear after misses and you can retry each question.",
  },
  // Orange (not red) communicates seriousness without signalling an error.
  exam: {
    label: "Exam",
    icon: GraduationCap,
    classes:
      "text-orange-800 bg-orange-100 dark:text-orange-200/90 dark:bg-orange-950/45 dark:ring-1 dark:ring-orange-800/35",
    title:
      "Exam mode: one attempt per question. Hints and retries are disabled.",
  },
  // Violet to stay visually distinct from practice/exam.
  review: {
    label: "Review",
    icon: History,
    classes:
      "text-violet-800 bg-violet-100 dark:text-violet-200/90 dark:bg-violet-950/45 dark:ring-1 dark:ring-violet-800/35",
    title:
      "Review mode: a dynamic set of questions you previously got wrong.",
  },
};

export function AssignmentModeBadge({
  mode,
  size = "sm",
}: AssignmentModeBadgeProps) {
  const meta = MODE_META[mode];
  const Icon = meta.icon;

  const sizeClasses =
    size === "xs"
      ? "text-[10px] px-1.5 py-0.5 gap-1"
      : "text-xs px-2 py-1 gap-1.5";
  const iconSize = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${sizeClasses} ${meta.classes}`}
      title={meta.title}
    >
      <Icon className={iconSize} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
