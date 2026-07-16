import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteSchoolQuestionSetLink,
  fetchStudentSelfPracticeQuestions,
  upsertSchoolQuestionSetLinks,
} from "@/lib/school-generated-questions";

function rpcRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "q1",
    set_id: "set-1",
    content_version: "cv-1",
    has_image: false,
    has_stimulus_image: false,
    set_name: "Set One",
    set_generated_at: "2026-07-01T00:00:00Z",
    generation_model_id: "model-1",
    generation_model_label: "Model One",
    payload: {
      id: "q1",
      module: 1,
      topic: "Genetics",
      standardId: "3.1.9-12.A",
      text: "What is DNA?",
      imageUrl: null,
      options: [],
      correctOptionId: "",
      source: "generated",
    },
    ...overrides,
  };
}

describe("fetchStudentSelfPracticeQuestions", () => {
  it("loads questions and set metadata from the RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        rpcRow(),
        rpcRow({ id: "q2", payload: { ...rpcRow().payload, id: "q2" } }),
        rpcRow({
          id: "q3",
          set_id: "set-2",
          set_name: "Set Two",
          generation_model_id: null,
          generation_model_label: null,
          payload: { ...rpcRow().payload, id: "q3" },
        }),
      ],
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    const { questions, questionSets } =
      await fetchStudentSelfPracticeQuestions(supabase);

    expect(rpc).toHaveBeenCalledWith("get_self_practice_questions");
    expect(questions.map((q) => q.id)).toEqual(["q1", "q2", "q3"]);
    expect(questions[0]).toMatchObject({
      id: "q1",
      questionSetId: "set-1",
      contentVersion: "cv-1",
      isVisible: true,
      includeInSelfPractice: true,
    });
    expect(questionSets).toHaveLength(2);
    expect(questionSets[0]).toMatchObject({
      id: "set-1",
      name: "Set One",
      source: "generated",
      createdAt: "2026-07-01T00:00:00Z",
      questionIds: ["q1", "q2"],
      generationModelId: "model-1",
      generationModelLabel: "Model One",
    });
    expect(questionSets[1]).toMatchObject({
      id: "set-2",
      questionIds: ["q3"],
      generationModelId: undefined,
      generationModelLabel: undefined,
    });
  });

  it("maps stripped-media flags onto questions", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [rpcRow({ has_image: true, has_stimulus_image: true })],
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    const { questions } = await fetchStudentSelfPracticeQuestions(supabase);
    expect(questions[0]).toMatchObject({
      hasImage: true,
      hasStimulusImage: true,
      imageUrl: null,
    });
  });

  it("returns empty results when the RPC fails", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "canceling statement due to statement timeout" },
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    const result = await fetchStudentSelfPracticeQuestions(supabase);
    expect(result).toEqual({ questions: [], questionSets: [] });
  });

  it("returns empty results when the RPC yields no rows", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const supabase = { rpc } as unknown as SupabaseClient;

    const result = await fetchStudentSelfPracticeQuestions(supabase);
    expect(result).toEqual({ questions: [], questionSets: [] });
  });
});

describe("upsertSchoolQuestionSetLinks", () => {
  it("returns null error when entries are empty", async () => {
    const supabase = {
      from: vi.fn(),
    } as unknown as SupabaseClient;
    const result = await upsertSchoolQuestionSetLinks(supabase, "set-1", []);
    expect(result).toEqual({ error: null });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("builds an upsert payload with the correct conflict target", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));
    const supabase = { from } as unknown as SupabaseClient;

    const result = await upsertSchoolQuestionSetLinks(supabase, "set-1", [
      { schoolId: "school-a" },
      { schoolId: "school-b" },
    ]);

    expect(result).toEqual({ error: null });
    expect(from).toHaveBeenCalledWith("school_question_sets");
    expect(upsert).toHaveBeenCalledWith(
      [
        {
          school_id: "school-a",
          set_id: "set-1",
          available_for_self_practice: true,
        },
        {
          school_id: "school-b",
          set_id: "set-1",
          available_for_self_practice: true,
        },
      ],
      { onConflict: "school_id,set_id" },
    );
  });

  it("surfaces error messages from Supabase", async () => {
    const upsert = vi.fn().mockResolvedValue({
      error: { message: "FK violation" },
    });
    const from = vi.fn(() => ({ upsert }));
    const supabase = { from } as unknown as SupabaseClient;

    const result = await upsertSchoolQuestionSetLinks(supabase, "set-1", [
      { schoolId: "school-a" },
    ]);
    expect(result).toEqual({ error: "FK violation" });
  });
});

describe("deleteSchoolQuestionSetLink", () => {
  it("issues a scoped delete and returns no error on success", async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null });
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const del = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ delete: del }));
    const supabase = { from } as unknown as SupabaseClient;

    const result = await deleteSchoolQuestionSetLink(
      supabase,
      "school-a",
      "set-1",
    );

    expect(result).toEqual({ error: null });
    expect(from).toHaveBeenCalledWith("school_question_sets");
    expect(eq1).toHaveBeenCalledWith("school_id", "school-a");
    expect(eq2).toHaveBeenCalledWith("set_id", "set-1");
  });

  it("returns the error message when the delete fails", async () => {
    const eq2 = vi.fn().mockResolvedValue({
      error: { message: "not permitted" },
    });
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const del = vi.fn(() => ({ eq: eq1 }));
    const from = vi.fn(() => ({ delete: del }));
    const supabase = { from } as unknown as SupabaseClient;

    const result = await deleteSchoolQuestionSetLink(
      supabase,
      "school-a",
      "set-1",
    );
    expect(result).toEqual({ error: "not permitted" });
  });
});
