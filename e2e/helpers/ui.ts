import type { BrowserContext, Page } from "@playwright/test";

export async function disableOnboardingTour(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const keyPrefix = "kb-tutor-onboarding-complete:";
    localStorage.setItem(`${keyPrefix}anonymous`, "1");

    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function patchedGetItem(key: string): string | null {
      if (typeof key === "string" && key.startsWith(keyPrefix)) {
        return "1";
      }
      return originalGetItem.call(this, key);
    };
  });
}

export async function dismissTourIfVisible(page: Page): Promise<void> {
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (await skipTour.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await skipTour.click();
    await skipTour.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
  }
}
