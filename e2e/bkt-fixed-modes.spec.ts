import { expect, test } from "@playwright/test";
import { setRoleCookie } from "./helpers/auth";
import { disableOnboardingTour, dismissTourIfVisible } from "./helpers/ui";
import { e2eMcq, mockStudentQuestionBank } from "./helpers/questions";

test("Exam keeps fixed question selection and does not call the adaptive endpoint", async ({ page, context, baseURL }) => {
  let adaptiveCalls = 0;
  await disableOnboardingTour(context);
  await setRoleCookie(context, baseURL, "student");
  await mockStudentQuestionBank(page);
  await page.unroute("**/api/practice/next");
  await page.route("**/api/practice/next", async (route) => {
    adaptiveCalls += 1;
    await route.fulfill({ status: 500, body: "unexpected" });
  });
  await page.goto("/practice?mode=exam&questions=1");
  await dismissTourIfVisible(page);
  await expect(page.getByText(e2eMcq.text)).toBeVisible();
  expect(adaptiveCalls).toBe(0);
});

test("Review keeps its empty queue behavior and does not call the adaptive endpoint", async ({ page, context, baseURL }) => {
  let adaptiveCalls = 0;
  await disableOnboardingTour(context);
  await setRoleCookie(context, baseURL, "student");
  await mockStudentQuestionBank(page);
  await page.unroute("**/api/practice/next");
  await page.route("**/api/practice/next", async (route) => {
    adaptiveCalls += 1;
    await route.fulfill({ status: 500, body: "unexpected" });
  });
  await page.goto("/practice?mode=review");
  await dismissTourIfVisible(page);
  await expect(page.getByText("Nothing to Review!")).toBeVisible();
  expect(adaptiveCalls).toBe(0);
});
