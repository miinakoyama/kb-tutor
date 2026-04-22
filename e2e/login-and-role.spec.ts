import { expect, test } from "@playwright/test";
import { clearRoleCookie, setRoleCookie } from "./helpers/auth";
import { disableOnboardingTour, dismissTourIfVisible } from "./helpers/ui";

test.describe("Login and role access", () => {
  test("student login dropdown only renders schools returned by public API", async ({
    page,
    context,
    baseURL,
  }) => {
    await disableOnboardingTour(context);
    await clearRoleCookie(context, baseURL);

    await page.route("**/api/public/schools", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          schools: [{ id: "school-visible", name: "Visible High School" }],
        }),
      });
    });

    await page.goto("/login");

    await expect(page.getByRole("option", { name: "Visible High School" })).toHaveCount(1);
    await expect(page.getByRole("option", { name: "Hidden High School" })).toHaveCount(0);
  });

  test("student login submits and navigates to practice @smoke", async ({
    page,
    context,
    baseURL,
  }) => {
    await disableOnboardingTour(context);
    await clearRoleCookie(context, baseURL);

    await page.route("**/api/public/schools", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          schools: [{ id: "school-1", name: "Demo High School" }],
        }),
      });
    });

    await page.route("**/api/auth/login", async (route) => {
      await setRoleCookie(context, baseURL, "student");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          redirectTo: "/practice?mode=practice",
        }),
      });
    });

    await page.goto("/login");
    await page.getByLabel("Student ID").fill("st000000001");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/practice\?mode=practice/);
    await expect(
      page.getByRole("button", { name: "Submit" }),
    ).toBeVisible();
  });

  test("student login shows an error when school is rejected by server", async ({
    page,
    context,
    baseURL,
  }) => {
    await disableOnboardingTour(context);
    await clearRoleCookie(context, baseURL);

    await page.route("**/api/public/schools", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          schools: [{ id: "school-hidden", name: "Hidden High School" }],
        }),
      });
    });

    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          error: "School not found.",
        }),
      });
    });

    await page.goto("/login");
    await page.getByLabel("Student ID").fill("st000000001");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("School not found.")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("staff login submits and navigates to teacher dashboard @smoke", async ({
    page,
    context,
    baseURL,
  }) => {
    await disableOnboardingTour(context);
    await clearRoleCookie(context, baseURL);

    await page.route("**/api/auth/login", async (route) => {
      await setRoleCookie(context, baseURL, "teacher");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          redirectTo: "/teacher-dashboard",
        }),
      });
    });

    await page.goto("/login/staff");
    await page.getByLabel("Email").fill("teacher@example.com");
    await page.getByLabel("Password").fill("password123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/teacher-dashboard$/);
    await expect(
      page.getByRole("heading", { name: "Teacher Dashboard" }),
    ).toBeVisible();
  });

  test("role guard protects teacher/admin routes @smoke", async ({
    page,
    context,
    baseURL,
  }) => {
    await disableOnboardingTour(context);
    await setRoleCookie(context, baseURL, "teacher");
    await page.goto("/teacher-dashboard");
    await dismissTourIfVisible(page);
    await expect(page).toHaveURL(/\/teacher-dashboard$/);
    await expect(
      page.getByRole("heading", { name: "Teacher Dashboard" }),
    ).toBeVisible();

    await setRoleCookie(context, baseURL, "admin");
    await page.goto("/content/accounts");
    await dismissTourIfVisible(page);
    await expect(page).toHaveURL(/\/content\/accounts$/);
    await expect(
      page.getByRole("heading", { name: "Account Management" }),
    ).toBeVisible();

    await setRoleCookie(context, baseURL, "student");
    await page.goto("/teacher-dashboard");
    await expect(page).toHaveURL(/(?:\/$|\/login(?:\?|$))/);
  });
});
