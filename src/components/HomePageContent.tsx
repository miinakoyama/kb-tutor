"use client";

import Link from "next/link";
import type { StudentAssignmentListItem } from "@/lib/student-assignments";
import type { KeystoneExamInfo } from "@/lib/keystone-exam";
import type { LearningEffort } from "@/lib/homepage/learning-effort";
import type { MasteryDatum } from "@/lib/progress/mastery";
import type { StudentProfileSummary } from "@/lib/homepage/profile-summary";
import { ExamCountdownCard } from "@/components/home/ExamCountdownCard";
import { LearningEffortCard } from "@/components/home/LearningEffortCard";
import { AssignedWorkList } from "@/components/home/AssignedWorkList";
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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-heading text-xl font-bold text-heading">{children}</h2>
  );
}

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
        <section aria-labelledby="your-progress-heading">
          <SectionHeading>
            <span id="your-progress-heading">Your progress</span>
          </SectionHeading>
          <div
            className={`mt-4 grid gap-4 ${
              keystoneExam ? "lg:grid-cols-[minmax(240px,300px)_1fr]" : ""
            }`}
          >
            {keystoneExam && <ExamCountdownCard exam={keystoneExam} />}
            <LearningEffortCard effort={learningEffort} />
          </div>
        </section>

        <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-8">
            <section aria-labelledby="assigned-work-heading">
              <div className="flex items-center justify-between gap-3">
                <SectionHeading>
                  <span id="assigned-work-heading">Assigned work</span>
                </SectionHeading>
                <Link
                  href="/assignments"
                  className="text-sm font-semibold transition hover:brightness-110"
                  style={{ color: "var(--assignment-completed)" }}
                >
                  View all
                </Link>
              </div>
              <div className="mt-2">
                <AssignedWorkList assignments={assignments} />
              </div>
            </section>

            <section aria-labelledby="practice-independently-heading">
              <SectionHeading>
                <span id="practice-independently-heading">
                  Practice independently
                </span>
              </SectionHeading>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <ReviewQuickStartCard />
                <SelfPracticeQuickStartCard weeklySeconds={selfPracticeWeeklySeconds} />
              </div>
            </section>
          </div>

          <div className="w-full lg:w-[340px] lg:flex-shrink-0">
            <ProfileCard profile={profileSummary} mastery={masterySummary} />
          </div>
        </div>
      </div>
    </main>
  );
}
