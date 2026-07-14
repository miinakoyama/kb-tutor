import { expect, test } from "@playwright/test";
import sampleShortAnswerItem from "../src/data/short-answer/sample-item.json";
import { setRoleCookie } from "./helpers/auth";
import { disableOnboardingTour, dismissTourIfVisible } from "./helpers/ui";
import { mockStudentQuestionBank } from "./helpers/questions";

test("adaptive Practice renders a banked SAQ whose parts include the target KC", async ({ page, context, baseURL }) => {
  const saq = {
    id: "e2e-adaptive-saq",
    module: 1,
    topic: "Structure and Function",
    standardId: "3.1.9-12.A",
    standardLabel: "DNA determines protein structure and function.",
    text: sampleShortAnswerItem.stem,
    imageUrl: null,
    options: [],
    correctOptionId: "",
    questionType: "open-ended",
    shortAnswer: sampleShortAnswerItem,
    source: "generated",
  };
  await disableOnboardingTour(context);
  await setRoleCookie(context, baseURL, "student");
  await mockStudentQuestionBank(page, { adaptiveQuestions: [saq] });
  await page.goto("/practice?mode=practice&topics=3.1.9-12.A&questions=1");
  await dismissTourIfVisible(page);
  await expect(page.getByText(sampleShortAnswerItem.stem)).toBeVisible();
  expect(Object.values(sampleShortAnswerItem.blueprint.taskSequence).some((part) => part.kcCode === "3.1.9-12.A3")).toBe(true);
});
