import { expect, test } from "@playwright/test";
import { setRoleCookie } from "./helpers/auth";
import { disableOnboardingTour, dismissTourIfVisible } from "./helpers/ui";
import { e2eMcq, mockStudentQuestionBank } from "./helpers/questions";

test("adaptive Practice requests and renders a server-selected first-pass MCQ", async ({ page, context, baseURL }) => {
  let requestedStandards: unknown = null;
  await disableOnboardingTour(context);
  await setRoleCookie(context, baseURL, "student");
  await mockStudentQuestionBank(page, { adaptiveQuestions: [e2eMcq] });
  page.on("request", (request) => {
    if (request.url().includes("/api/practice/next")) {
      requestedStandards = request.postDataJSON()?.standardIds;
    }
  });
  await page.goto("/practice?mode=practice&topics=3.1.9-12.A&questions=2");
  await dismissTourIfVisible(page);
  await expect(page.getByText(e2eMcq.text)).toBeVisible();
  expect(requestedStandards).toEqual(["3.1.9-12.A"]);
});
