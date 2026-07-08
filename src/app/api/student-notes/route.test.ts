import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let currentUser: { id: string } | null = { id: "student-1" };
let noteRows: Array<{
  question_id: string;
  note_text: string;
  updated_at: string;
}> = [];
let questionRows: Array<{ id: string; payload: unknown }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            range: async () => ({
              data: noteRows,
              count: noteRows.length,
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        in: async () => ({ data: questionRows }),
      }),
    }),
  }),
}));

function makeRequest(query = ""): Request {
  return new Request(`http://localhost/api/student-notes${query}`);
}

async function load() {
  return import("./route");
}

describe("GET /api/student-notes", () => {
  beforeEach(() => {
    vi.resetModules();
    currentUser = { id: "student-1" };
    noteRows = [
      {
        question_id: "sa-0001",
        note_text: "Transpiration pulls water up.",
        updated_at: "2026-07-08T12:00:00Z",
      },
      {
        question_id: "deleted-q",
        note_text: "This one is gone.",
        updated_at: "2026-07-07T12:00:00Z",
      },
    ];
    questionRows = [
      {
        id: "sa-0001",
        payload: {
          topic: "Ecology",
          shortAnswer: { stem: "A researcher investigated stomata density." },
        },
      },
    ];
  });
  afterEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    currentUser = null;
    const { GET } = await load();
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns caller notes with question previews", async () => {
    const { GET } = await load();
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(2);
    expect(json.notes[0].questionId).toBe("sa-0001");
    expect(json.notes[0].question.available).toBe(true);
    expect(json.notes[0].question.topic).toBe("Ecology");
    expect(json.notes[0].question.preview).toContain("stomata");
  });

  it("marks notes for deleted questions as unavailable", async () => {
    const { GET } = await load();
    const res = await GET(makeRequest());
    const json = await res.json();
    const deleted = json.notes.find(
      (n: { questionId: string }) => n.questionId === "deleted-q",
    );
    expect(deleted.question.available).toBe(false);
    expect(deleted.noteText).toBe("This one is gone.");
  });
});
