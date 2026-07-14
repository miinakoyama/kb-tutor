"use client";

import Link from "next/link";
import { CalendarDays, Flame } from "lucide-react";
import type { StudentAssignmentListItem } from "@/lib/student-assignments";
import {
  daysUntilExam,
  formatExamDate,
  type KeystoneExamInfo,
} from "@/lib/keystone-exam";
import type { TopicKcCoverage } from "@/lib/homepage/kc-coverage";
import type { StudentProfileSummary } from "@/lib/homepage/profile-summary";
import { HomeHeader } from "@/components/home/HomeHeader";
import { ProfileCard } from "@/components/home/ProfileCard";
import { QuickStartAssignments } from "@/components/home/QuickStartAssignments";
import {
  ReviewQuickStartCard,
  SelfPracticeQuickStartCard,
} from "@/components/home/QuickStartPracticeReview";
import { LearningJourney } from "@/components/home/LearningJourney";

interface HomePageContentProps {
  assignments: StudentAssignmentListItem[];
  keystoneExam?: KeystoneExamInfo | null;
  selfPracticeWeeklySeconds: number | null;
  topicKcCoverage: TopicKcCoverage[];
  profileSummary: StudentProfileSummary;
}

export function HomePageContent({
  assignments,
  keystoneExam = null,
  selfPracticeWeeklySeconds,
  topicKcCoverage,
  profileSummary,
}: HomePageContentProps) {
  return (
    <main
      className="mx-auto w-full px-4 pb-8 pt-6 sm:px-6 sm:pt-8 lg:px-10 xl:px-12"
      style={{ maxWidth: 1500 }}
    >
      {/* Matches the xl:w-[96%] inner inset StudentAssignmentsList uses on
          every section, on top of <main>'s own padding. */}
      <div className="mx-auto w-full xl:w-[96%]">
        <HomeHeader />

        {keystoneExam && <KeystoneExamCountdown exam={keystoneExam} />}

        <LearningJourney topics={topicKcCoverage} />

        <section className="mt-6">
          <div className="mb-2.5 flex items-center justify-between gap-3 lg:w-[70%]">
            <h2
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--muted-foreground)" }}
            >
              In progress learning content
            </h2>
            <Link
              href="/assignments"
              className="text-sm font-semibold transition hover:brightness-110"
              style={{ color: "var(--assignment-completed)" }}
            >
              See all assignments →
            </Link>
          </div>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
            <div className="flex flex-col gap-4 lg:w-[70%]">
              <QuickStartAssignments assignments={assignments} showHeader={false} />
              <div className="grid gap-4 sm:grid-cols-2 lg:flex-1">
                <SelfPracticeQuickStartCard weeklySeconds={selfPracticeWeeklySeconds} />
                <ReviewQuickStartCard />
              </div>
            </div>

            <div className="lg:flex-1">
              <ProfileCard profile={profileSummary} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function KeystoneExamCountdown({ exam }: { exam: KeystoneExamInfo }) {
  const days = daysUntilExam(exam.examDate);
  if (days === null || days < 0) return null;

  const { accent, subtitle } = getCountdownTone(days);
  const headline =
    days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`;

  return (
    <section
      aria-label="Keystone exam countdown"
      className={`mb-5 rounded-2xl border ${accent.border} ${accent.bg} p-4 sm:p-5 shadow-sm`}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        <div
          className={`hidden sm:flex items-center justify-center w-10 h-10 rounded-full ${accent.iconBg} ${accent.iconText}`}
        >
          <Flame className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${accent.label}`}
          >
            <Flame className="w-4 h-4 sm:hidden" />
            Keystone Exam
          </div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {days === 0 ? (
              <span
                className={`text-2xl sm:text-3xl font-extrabold ${accent.headline}`}
              >
                It&apos;s exam day
              </span>
            ) : (
              <>
                <span
                  className={`text-3xl sm:text-4xl font-extrabold ${accent.headline}`}
                >
                  {headline}
                </span>
                <span
                  className={`text-sm sm:text-base font-semibold ${accent.text}`}
                >
                  to go
                </span>
              </>
            )}
          </div>
          <p className={`mt-1 text-sm ${accent.text}`}>{subtitle}</p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="w-3.5 h-3.5" />
            Exam date: {formatExamDate(exam.examDate)}
          </p>
        </div>
      </div>
    </section>
  );
}

type CountdownTone = {
  border: string;
  bg: string;
  iconBg: string;
  iconText: string;
  label: string;
  headline: string;
  text: string;
};

function getCountdownTone(days: number): {
  accent: CountdownTone;
  subtitle: string;
} {
  if (days <= 7) {
    return {
      accent: {
        border: "border-error-border",
        bg: "bg-gradient-to-r from-red-50 to-orange-50 dark:from-rose-950/50 dark:to-orange-950/40",
        iconBg: "bg-error-light",
        iconText: "text-error",
        label: "text-error",
        headline: "text-error",
        text: "text-error/90",
      },
      subtitle:
        days === 0
          ? "Stay focused — you've got this!"
          : "Final stretch. Every practice session counts.",
    };
  }
  if (days <= 30) {
    return {
      accent: {
        border: "border-amber-300 dark:border-amber-700/40",
        bg: "bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/45 dark:to-amber-950/30",
        iconBg: "bg-amber-100 dark:bg-amber-900/50",
        iconText: "text-amber-600 dark:text-amber-300",
        label: "text-amber-700 dark:text-amber-300",
        headline: "text-amber-700 dark:text-amber-200",
        text: "text-amber-800/90 dark:text-amber-200/80",
      },
      subtitle: "The exam is coming up. Keep your streak going!",
    };
  }
  return {
    accent: {
      border: "border-primary/40 dark:border-primary-border",
      bg: "bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-emerald-950/30",
      iconBg: "bg-primary/15",
      iconText: "text-primary",
      label: "text-primary-hover dark:text-forest",
      headline: "text-heading",
      text: "text-heading/80 dark:text-muted-foreground",
    },
    subtitle: "Plenty of time — steady practice builds confidence.",
  };
}
