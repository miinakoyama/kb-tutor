import { expect, test } from "@playwright/test";
import type { Question } from "@/types/question";
import { setRoleCookie } from "./helpers/auth";
import { disableOnboardingTour, dismissTourIfVisible } from "./helpers/ui";

test("teacher creates an assignment and student completes it in practice mode @full", async ({
  browser,
  baseURL,
}) => {
  const teacherContext = await browser.newContext();
  await disableOnboardingTour(teacherContext);
  await setRoleCookie(teacherContext, baseURL, "teacher");
  const teacherPage = await teacherContext.newPage();

  let assignmentCreated = false;
  let submittedBody: Record<string, unknown> = {};
  const assignmentTitle = "Genetics Quick Check";

  await teacherPage.route("**/api/assignments/manage**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "GET" && url.searchParams.get("questionsForSetId")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          questions: [
            {
              questionId: "q-assignment-1",
              payload: {
                id: "q-assignment-1",
                module: 1,
                topic: "Genetics",
                text: "Which organelle is known as the powerhouse of the cell?",
                imageUrl: null,
                options: [
                  { id: "A", text: "Mitochondria" },
                  { id: "B", text: "Ribosome" },
                ],
                correctOptionId: "A",
                source: "manual",
              } satisfies Question,
            },
          ],
        }),
      });
      return;
    }

    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          schools: [{ id: "school-1", name: "Demo High School", member_count: 110 }],
          question_sets: [
            {
              id: "set-1",
              name: "Cell Biology Set",
              generated_at: "2026-04-20T10:00:00.000Z",
              question_count: 1,
              school_ids: ["school-1"],
              owned_by_requester: true,
            },
          ],
          assignments: assignmentCreated
            ? [
                {
                  id: "as-new",
                  title: assignmentTitle,
                  school_id: "school-1",
                  due_date: null,
                  module_ids: [1],
                  topics: ["Genetics"],
                  target_minutes: 20,
                  created_at: "2026-04-22T10:00:00.000Z",
                  snapshot_count: 1,
                  mode: "practice",
                  randomize_order: true,
                },
              ]
            : [],
        }),
      });
      return;
    }

    if (request.method() === "POST") {
      submittedBody = JSON.parse(request.postData() ?? "{}") as Record<string, unknown>;
      assignmentCreated = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ assignmentId: "as-new" }),
      });
      return;
    }

    await route.fallback();
  });

  await teacherPage.goto("/assignments/manage/new?setId=set-1&schoolId=school-1");
  await dismissTourIfVisible(teacherPage);
  await expect(
    teacherPage.getByRole("heading", { name: "Create Assignment" }),
  ).toBeVisible();
  await teacherPage.getByLabel("Title").fill(assignmentTitle);
  await expect(teacherPage.getByText("Selected: 1 questions")).toBeVisible();
  await dismissTourIfVisible(teacherPage);
  await teacherPage.getByRole("button", { name: "Create assignment" }).click();

  await expect(teacherPage).toHaveURL(/\/assignments\/manage$/);
  await expect(teacherPage.getByText(assignmentTitle)).toBeVisible();
  expect(submittedBody.title).toBe(assignmentTitle);
  expect(submittedBody.sourceType).toBe("existing_set");
  expect(Array.isArray(submittedBody.selectedQuestions)).toBe(true);

  await teacherContext.close();

  const studentContext = await browser.newContext();
  await disableOnboardingTour(studentContext);
  await setRoleCookie(studentContext, baseURL, "student");
  const studentPage = await studentContext.newPage();

  let completionCalls = 0;
  await studentPage.route("**/api/assignments/as-new/questions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        questions: [
          {
            id: "q-assignment-1",
            module: 1,
            topic: "Genetics",
            text: "Which organelle is known as the powerhouse of the cell?",
            imageUrl: null,
            options: [
              { id: "A", text: "Mitochondria" },
              { id: "B", text: "Ribosome" },
            ],
            correctOptionId: "A",
            source: "manual",
          } satisfies Question,
        ],
        answered: {},
      }),
    });
  });

  await studentPage.route("**/api/assignments/as-new/completion", async (route) => {
    completionCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await studentPage.goto("/practice?mode=practice&assignmentId=as-new");
  await dismissTourIfVisible(studentPage);
  await expect(
    studentPage.getByText(
      "Which organelle is known as the powerhouse of the cell?",
    ),
  ).toBeVisible();

  await dismissTourIfVisible(studentPage);
  await studentPage.getByRole("button", { name: /Mitochondria/ }).click();
  await studentPage.getByRole("button", { name: "Submit" }).click();
  await studentPage.getByRole("button", { name: "View Results" }).click();

  await expect(
    studentPage.getByRole("heading", { name: "Session Complete" }),
  ).toBeVisible();
  expect(completionCalls).toBeGreaterThan(0);

  await studentContext.close();
});
