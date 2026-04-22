import { expect, test } from "@playwright/test";
import { setRoleCookie } from "./helpers/auth";
import { disableOnboardingTour, dismissTourIfVisible } from "./helpers/ui";

test("student can start self practice session from planner @smoke", async ({
  page,
  context,
  baseURL,
}) => {
  await disableOnboardingTour(context);
  await setRoleCookie(context, baseURL, "student");

  await page.goto("/self-practice");
  await dismissTourIfVisible(page);

  await expect(
    page.getByRole("heading", { name: "Self Practice" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Practice" })).toBeDisabled();

  await page.getByRole("button", { name: "Select all areas" }).click();
  await page.getByRole("link", { name: "Start Practice" }).click();

  await expect(page).toHaveURL(/\/practice\?mode=practice/);
  await dismissTourIfVisible(page);
  await expect(page.getByRole("button", { name: "Submit" })).toBeVisible();
});
