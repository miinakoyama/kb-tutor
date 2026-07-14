import type { Page } from "@playwright/test";

export const e2eMcq = {
  id: "e2e-adaptive-q1",
  module: 1,
  topic: "Structure and Function",
  standardId: "3.1.9-12.A",
  standardLabel: "DNA determines protein structure and function.",
  text: "Which process produces an mRNA copy from DNA?",
  imageUrl: null,
  options: [
    { id: "A", text: "Transcription" },
    { id: "B", text: "Translation" },
    { id: "C", text: "Replication" },
    { id: "D", text: "Diffusion" },
  ],
  correctOptionId: "A",
  kcCode: "3.1.9-12.A2",
  source: "generated",
};

export async function mockStudentQuestionBank(
  page: Page,
  options: { adaptiveQuestions?: unknown[] } = {},
): Promise<void> {
  const adaptiveQuestions = options.adaptiveQuestions ?? [e2eMcq];
  let adaptiveIndex = 0;
  await page.route("**/api/e2e/questions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ questions: [{ ...e2eMcq, questionSetId: "e2e-set", includeInSelfPractice: true }] }),
    });
  });
  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function getItem(key: string) {
      if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
        const encoded = btoa(JSON.stringify({ sub: "10000000-0000-4000-8000-000000000001", role: "authenticated", exp: 4102444800 }))
          .replaceAll("=", "")
          .replaceAll("+", "-")
          .replaceAll("/", "_");
        return JSON.stringify({
          access_token: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${encoded}.e2e`,
          refresh_token: "e2e-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: 4102444800,
          user: {
            id: "10000000-0000-4000-8000-000000000001",
            aud: "authenticated",
            role: "authenticated",
            email: "student@example.com",
            app_metadata: {},
            user_metadata: { role: "student" },
            created_at: "2026-01-01T00:00:00Z",
          },
        });
      }
      return originalGetItem.call(this, key);
    };
  });
  await page.route("**/auth/v1/user", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "10000000-0000-4000-8000-000000000001",
        aud: "authenticated",
        role: "authenticated",
        email: "student@example.com",
        app_metadata: {},
        user_metadata: { role: "student" },
        created_at: "2026-01-01T00:00:00Z",
      }),
    });
  });
  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/").pop();
    let rows: unknown[] = [];
    if (table === "profiles") rows = [{ role: "student" }];
    if (table === "school_question_sets") rows = [{ set_id: "e2e-set" }];
    if (table === "generated_question_sets") {
      rows = [{ id: "e2e-set", name: "E2E adaptive bank", generated_at: "2026-01-01T00:00:00Z", generation_model_id: "manual", generation_model_label: "Manual" }];
    }
    if (table === "generated_questions") {
      rows = [{ id: e2eMcq.id, set_id: "e2e-set", payload: e2eMcq, is_visible: true, include_in_self_practice: true }];
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows), headers: { "content-range": `0-${Math.max(0, rows.length - 1)}/${rows.length}` } });
  });
  await page.route("**/api/practice/next", async (route) => {
    const selected = adaptiveQuestions[Math.min(adaptiveIndex, adaptiveQuestions.length - 1)];
    adaptiveIndex += 1;
    if (!selected) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "complete", reason: "all_mastered" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "selected", lane: "first_pass", targetKcCode: "3.1.9-12.A2", question: { ...(selected as object), questionSetId: "e2e-set" } }),
    });
  });
  await page.route("**/api/analytics/attempts", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, isCorrect: true }) });
  });
}
