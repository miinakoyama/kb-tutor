"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpenCheck, ClipboardList, LayoutDashboard, NotebookPen } from "lucide-react";

type AppRole = "student" | "teacher";

interface OnboardingStep {
  title: string;
  description: string;
  points: string[];
}

interface FirstLoginOnboardingProps {
  role: AppRole;
  onFinish: () => void;
}

const COMMON_MODE_POINTS = [
  "Practice mode: study with immediate explanations while you learn.",
  "Exam mode: answer in a test-like flow to check readiness.",
  "Review mode: revisit mistakes and strengthen weak areas.",
];

const STUDENT_STEPS: OnboardingStep[] = [
  {
    title: "Welcome to KB Tutor",
    description: "This quick tour takes less than a minute and covers the essentials.",
    points: [
      "Use the left menu to move between pages.",
      "Start with Assignments or Self Practice.",
      "You can open this and continue in your own pace.",
    ],
  },
  {
    title: "Two main study routes",
    description: "Most students will use these two pages every day.",
    points: [
      "Assignments: teacher-assigned work with deadlines.",
      "Self Practice: your own practice by topic and mode.",
      "Tip: complete due assignments first, then self practice.",
    ],
  },
  {
    title: "Three learning modes",
    description: "Each mode supports a different goal.",
    points: COMMON_MODE_POINTS,
  },
  {
    title: "Quick start",
    description: "Recommended order for your first session.",
    points: [
      "Open Assignments and start one task.",
      "Then open Self Practice and try one short set.",
      "Use Review mode to revisit incorrect answers.",
    ],
  },
];

const TEACHER_STEPS: OnboardingStep[] = [
  {
    title: "Welcome to KB Tutor",
    description: "This short tour explains the core teacher workflow.",
    points: [
      "Use the left menu to navigate key teacher pages.",
      "Your core flow is: create assignment → monitor progress.",
      "You can skip now and start anytime.",
    ],
  },
  {
    title: "Core teacher pages",
    description: "You will usually switch between these pages.",
    points: [
      "Assignments: create and manage class assignments.",
      "Teacher Dashboard: track completion and learning trends.",
      "Contents: manage question resources.",
    ],
  },
  {
    title: "Student experience modes",
    description: "These are the three modes students will see.",
    points: COMMON_MODE_POINTS,
  },
  {
    title: "Quick start",
    description: "A simple first-run checklist.",
    points: [
      "Create one assignment in Assignments.",
      "Check responses from Teacher Dashboard.",
      "Use mode results to guide follow-up practice.",
    ],
  },
];

export function FirstLoginOnboarding({ role, onFinish }: FirstLoginOnboardingProps) {
  const steps = role === "teacher" ? TEACHER_STEPS : STUDENT_STEPS;
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-4 py-6">
      <div className="w-full max-w-2xl rounded-2xl border border-[#16a34a]/20 bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#16a34a]">
                Quick tour
              </p>
              <h2 className="text-xl font-bold text-[#14532d]">{currentStep.title}</h2>
            </div>
            <span className="rounded-full bg-[#16a34a]/10 px-2.5 py-1 text-xs font-semibold text-[#166534]">
              {stepIndex + 1} / {steps.length}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-600">{currentStep.description}</p>
        </div>

        <div className="px-6 py-5">
          <ul className="space-y-3">
            {currentStep.points.map((point) => (
              <li key={point} className="flex items-start gap-2 text-sm text-slate-700">
                <BookOpenCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#16a34a]" />
                <span>{point}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <QuickLink href="/assignments" icon={ClipboardList} label="Go to Assignments" />
            <QuickLink href="/self-practice" icon={NotebookPen} label="Go to Self Practice" />
            {role === "teacher" ? (
              <QuickLink
                href="/teacher-dashboard"
                icon={LayoutDashboard}
                label="Go to Dashboard"
              />
            ) : (
              <QuickLink href="/" icon={LayoutDashboard} label="Go to Home" />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onFinish}
            className="text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            Skip tour
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
              disabled={stepIndex === 0}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (isLastStep) {
                  onFinish();
                  return;
                }
                setStepIndex((prev) => Math.min(steps.length - 1, prev + 1));
              }}
              className="rounded-lg bg-[#16a34a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#15803d]"
            >
              {isLastStep ? "Start using KB Tutor" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#16a34a]/20 bg-[#16a34a]/5 px-3 py-2 text-sm font-medium text-[#166534] hover:bg-[#16a34a]/10"
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );
}
