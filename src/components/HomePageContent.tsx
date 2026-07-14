"use client";

import type { StudentAssignmentListItem } from "@/lib/student-assignments";
import type { KeystoneExamInfo } from "@/lib/keystone-exam";
import type { LearningEffort } from "@/lib/homepage/learning-effort";
import type { MasteryDatum } from "@/lib/progress/mastery";
import type { StudentProfileSummary } from "@/lib/homepage/profile-summary";
import { ExamCountdownCard } from "@/components/home/ExamCountdownCard";
import { LearningEffortCard } from "@/components/home/LearningEffortCard";
import { AssignedWorkList } from "@/components/home/AssignedWorkList";
import { HomeSearch } from "@/components/home/HomeSearch";
import { ProfileCard } from "@/components/home/ProfileCard";
import {
  ReviewQuickStartCard,
  SelfPracticeQuickStartCard,
} from "@/components/home/QuickStartPracticeReview";

interface HomePageContentProps {
  assignments: StudentAssignmentListItem[];
  keystoneExam?: KeystoneExamInfo | null;
  selfPracticeWeeklySeconds: number | null;
  learningEffort: LearningEffort | null;
  masterySummary: MasteryDatum[];
  profileSummary: StudentProfileSummary;
}

/**
 * Bento-box layout: the page title is the only text outside a card — every
 * section heading lives inside its own tile.
 */
export function HomePageContent({
  assignments,
  keystoneExam = null,
  selfPracticeWeeklySeconds,
  learningEffort,
  masterySummary,
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1
            className="font-bold text-slate-gray"
            style={{
              fontSize: 26,
              lineHeight: 1.25,
              letterSpacing: "-0.4px",
              fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
            }}
          >
            Dashboard
          </h1>
          <HomeSearch assignments={assignments} />
        </div>

        <section aria-label="Your progress" className="mt-6">
          <div
            className={`grid gap-4 ${
              keystoneExam ? "lg:grid-cols-[minmax(192px,240px)_1fr]" : ""
            }`}
          >
            {keystoneExam && <ExamCountdownCard exam={keystoneExam} />}
            <LearningEffortCard effort={learningEffort} />
          </div>
        </section>

        {/* 70/30 split spanning the full row, so the outer edges line up
            with the countdown + Learning effort row above. */}
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:gap-x-12">
          <div className="flex min-w-0 flex-col gap-6">
            <AssignedWorkList assignments={assignments} />

            {/* One bento tile with two inner practice tiles; flex-1 keeps
                the column's bottom level with the profile card. */}
            <section
              aria-labelledby="practice-independently-heading"
              className="flex flex-1 flex-col rounded-[24px] p-5 sm:p-6"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--assignment-glass-border)",
                boxShadow: "var(--assignment-card-shadow)",
              }}
            >
              <h2
                id="practice-independently-heading"
                className="font-heading text-lg font-bold text-slate-gray"
              >
                Practice independently
              </h2>
              <div className="mt-4 grid flex-1 gap-4 sm:grid-cols-2">
                <ReviewQuickStartCard />
                <SelfPracticeQuickStartCard weeklySeconds={selfPracticeWeeklySeconds} />
              </div>
            </section>
          </div>

          <div className="min-w-0">
            <ProfileCard profile={profileSummary} mastery={masterySummary} />
          </div>
        </div>
      </div>
    </main>
  );
}
