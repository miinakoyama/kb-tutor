import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";

const {
  assignmentListMock,
  createSupabaseServerClientMock,
  keystoneExamMock,
  redirectMock,
  learningEffortMock,
  masterySummaryMock,
  profileSummaryMock,
  resolveRoleWithServerFallbackMock,
  selfPracticeWeeklySecondsMock,
  userSettingsMock,
} = vi.hoisted(() => ({
  assignmentListMock: vi.fn(),
  createSupabaseServerClientMock: vi.fn(),
  keystoneExamMock: vi.fn(),
  learningEffortMock: vi.fn(),
  masterySummaryMock: vi.fn(),
  profileSummaryMock: vi.fn(),
  redirectMock: vi.fn((path: string): never => {
    throw new Error(`REDIRECT:${path}`);
  }),
  resolveRoleWithServerFallbackMock: vi.fn(),
  selfPracticeWeeklySecondsMock: vi.fn(),
  userSettingsMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

vi.mock("@/lib/auth/server-role", () => ({
  resolveRoleWithServerFallback: resolveRoleWithServerFallbackMock,
}));

vi.mock("@/lib/student-assignments", () => ({
  getStudentAssignmentList: assignmentListMock,
}));

vi.mock("@/lib/keystone-exam", () => ({
  getStudentKeystoneExam: keystoneExamMock,
}));

vi.mock("@/lib/user-settings", () => ({
  getStudentUserSettings: userSettingsMock,
}));

vi.mock("@/lib/homepage/self-practice-stats", () => ({
  getSelfPracticeWeeklySeconds: selfPracticeWeeklySecondsMock,
}));

vi.mock("@/lib/homepage/learning-effort", () => ({
  getLearningEffort: learningEffortMock,
}));

vi.mock("@/lib/homepage/mastery-summary", () => ({
  getMasterySummary: masterySummaryMock,
}));

vi.mock("@/lib/homepage/profile-summary", () => ({
  getStudentProfileSummary: profileSummaryMock,
}));

vi.mock("@/components/HomePageContent", () => ({
  HomePageContent: () => null,
}));

function mockSupabase() {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { role: "admin" },
  });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const supabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: "user-1",
            app_metadata: {},
            user_metadata: {},
          },
        },
      }),
    },
    from,
  };
  createSupabaseServerClientMock.mockResolvedValue(supabase);
  return { supabase, from };
}

describe("Home role routing", () => {
  beforeEach(() => {
    assignmentListMock.mockReset();
    createSupabaseServerClientMock.mockReset();
    keystoneExamMock.mockReset();
    redirectMock.mockClear();
    learningEffortMock.mockReset();
    masterySummaryMock.mockReset();
    profileSummaryMock.mockReset();
    resolveRoleWithServerFallbackMock.mockReset();
    selfPracticeWeeklySecondsMock.mockReset();
    userSettingsMock.mockReset();
  });

  it("redirects admins before loading student home data", async () => {
    mockSupabase();
    resolveRoleWithServerFallbackMock.mockResolvedValue("admin");

    await expect(Home()).rejects.toThrow("REDIRECT:/content/accounts");

    expect(assignmentListMock).not.toHaveBeenCalled();
    expect(keystoneExamMock).not.toHaveBeenCalled();
    expect(userSettingsMock).not.toHaveBeenCalled();
  });

  it("redirects teachers before loading student home data", async () => {
    mockSupabase();
    resolveRoleWithServerFallbackMock.mockResolvedValue("teacher");

    await expect(Home()).rejects.toThrow("REDIRECT:/teacher-dashboard");

    expect(assignmentListMock).not.toHaveBeenCalled();
    expect(keystoneExamMock).not.toHaveBeenCalled();
    expect(userSettingsMock).not.toHaveBeenCalled();
  });

  it("renders the student home after resolving a student role", async () => {
    const { supabase } = mockSupabase();
    resolveRoleWithServerFallbackMock.mockResolvedValue("student");
    userSettingsMock.mockResolvedValue({ timeZone: "America/New_York" });
    assignmentListMock.mockResolvedValue({ assignments: [] });
    keystoneExamMock.mockResolvedValue(null);
    selfPracticeWeeklySecondsMock.mockResolvedValue(null);
    learningEffortMock.mockResolvedValue(null);
    masterySummaryMock.mockResolvedValue([]);
    profileSummaryMock.mockResolvedValue({ name: null, schoolName: null });

    await expect(Home()).resolves.toBeTruthy();

    expect(userSettingsMock).toHaveBeenCalledWith(supabase);
    expect(assignmentListMock).toHaveBeenCalledWith(supabase, "user-1");
    expect(keystoneExamMock).toHaveBeenCalledWith(supabase, "user-1", {
      timeZone: "America/New_York",
    });
    expect(learningEffortMock).toHaveBeenCalledWith(supabase, "user-1", {
      timeZone: "America/New_York",
    });
    expect(masterySummaryMock).toHaveBeenCalledWith(supabase, "user-1");
  });
});
