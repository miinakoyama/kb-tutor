export type OnboardingRole = "student" | "teacher";

export const TOUR_TARGET_IDS = {
  SIDEBAR_ROOT: "tour-sidebar-root",
  SIDEBAR_TOGGLE: "tour-sidebar-toggle",
  HOME: "tour-home",
  STUDENT_ASSIGNMENTS: "tour-student-assignments",
  SELF_PRACTICE: "tour-self-practice",
  PROGRESS: "tour-progress",
  REVIEW: "tour-review",
  TEACHER_DASHBOARD: "tour-teacher-dashboard",
  TEACHER_ASSIGNMENTS: "tour-teacher-assignments",
  CONTENTS: "tour-contents",
} as const;

type TourTargetId = (typeof TOUR_TARGET_IDS)[keyof typeof TOUR_TARGET_IDS];

export interface OnboardingModeCard {
  label: string;
  description: string;
}

export interface OnboardingStep {
  title: string;
  description: string;
  type: "modal" | "spotlight";
  targetIds?: TourTargetId[];
  routePath?: string;
  modeCards?: OnboardingModeCard[];
  primaryActionLabel?: string;
}

const STUDENT_MODE_CARDS: OnboardingModeCard[] = [
  {
    label: "Practice Mode",
    description: "Learn with immediate feedback after each question.",
  },
  {
    label: "Exam Mode",
    description: "Take a test-style session and see your score at the end.",
  },
  {
    label: "Review Mode",
    description: "Retry missed questions to strengthen weak areas.",
  },
];

const STUDENT_STEPS: OnboardingStep[] = [
  {
    title: "Welcome to KB Tutor",
    description:
      "Welcome to KB Tutor. This quick tour highlights the core features in about one minute.",
    type: "modal",
  },
  {
    title: "Self Practice",
    description:
      "Create your own practice session by choosing topic and mode",
    type: "spotlight",
    targetIds: [TOUR_TARGET_IDS.SELF_PRACTICE],
    routePath: "/self-practice",
  },
  {
    title: "Three Practice Modes",
    description: "Each mode supports a different learning goal.",
    type: "modal",
    modeCards: STUDENT_MODE_CARDS,
  },
  {
    title: "Review",
    description:
      "Review missed questions, bookmarked questions, and your notes in one place.",
    type: "spotlight",
    targetIds: [TOUR_TARGET_IDS.REVIEW],
    routePath: "/bookmarks",
  },
  {
    title: "You Are Ready",
    description:
      "You are all set. You can replay this tour anytime from Settings.",
    type: "modal",
    primaryActionLabel: "Finish tour",
  },
];

const TEACHER_STEPS: OnboardingStep[] = [
  {
    title: "Welcome to KB Tutor",
    description:
      "This quick tour introduces the core teacher workflow.",
    type: "modal",
  },
  {
    title: "Collapse Sidebar",
    description:
      "Use the < button at the top of the sidebar to collapse or expand the menu and free up space.",
    type: "spotlight",
    targetIds: [TOUR_TARGET_IDS.SIDEBAR_TOGGLE],
  },
  {
    title: "Teacher Dashboard",
    description:
      "Review accuracy and time spent by student and by standard.",
    type: "spotlight",
    targetIds: [TOUR_TARGET_IDS.TEACHER_DASHBOARD],
    routePath: "/teacher-dashboard",
  },
  {
    title: "Assignments",
    description:
      "Create and assign work to classes or students. You can choose Practice, Exam, or Review mode.",
    type: "spotlight",
    targetIds: [TOUR_TARGET_IDS.TEACHER_ASSIGNMENTS],
    routePath: "/assignments/manage",
  },
  {
    title: "Content",
    description:
      "Add and edit the question bank. You can also generate questions with Gemini.",
    type: "spotlight",
    targetIds: [TOUR_TARGET_IDS.CONTENTS],
    routePath: "/content",
  },
  {
    title: "You Are Ready",
    description:
      "You are all set. You can replay this tour anytime from Settings.",
    type: "modal",
    primaryActionLabel: "Finish tour",
  },
];

export function getOnboardingSteps(role: OnboardingRole): OnboardingStep[] {
  return role === "teacher" ? TEACHER_STEPS : STUDENT_STEPS;
}

export type SidebarRole = "student" | "teacher" | "admin";

export function getTourTargetIdForHref(
  href: string,
  role: SidebarRole,
): TourTargetId | undefined {
  if (href === "/") return TOUR_TARGET_IDS.HOME;
  if (href === "/self-practice") return TOUR_TARGET_IDS.SELF_PRACTICE;
  if (href === "/bookmarks") return TOUR_TARGET_IDS.REVIEW;

  if (href === "/assignments") return TOUR_TARGET_IDS.STUDENT_ASSIGNMENTS;
  if (href === "/teacher-dashboard" && role !== "student") {
    return TOUR_TARGET_IDS.TEACHER_DASHBOARD;
  }
  if (href === "/assignments/manage" && role !== "student") {
    return TOUR_TARGET_IDS.TEACHER_ASSIGNMENTS;
  }
  if (href === "/content" && role !== "student") return TOUR_TARGET_IDS.CONTENTS;

  return undefined;
}
