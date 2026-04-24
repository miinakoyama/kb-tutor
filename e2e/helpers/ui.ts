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
  const anyDismissButton = page
    .getByRole("button", {
      name: /^(Skip tour|Got it|Dismiss feature tip)$/,
    })
    .first();

  const hasDismissUi = await anyDismissButton
    .isVisible({ timeout: 5_000 })
    .catch(() => false);
  if (!hasDismissUi) return;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    let dismissedSomething = false;

    const skipTour = page.getByRole("button", { name: "Skip tour" });
    if (await skipTour.isVisible({ timeout: 500 }).catch(() => false)) {
      await skipTour.click();
      await skipTour.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
      dismissedSomething = true;
    }

    const featureTipCta = page.getByRole("button", { name: "Got it" }).first();
    if (await featureTipCta.isVisible({ timeout: 500 }).catch(() => false)) {
      await featureTipCta.click();
      await featureTipCta.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
      dismissedSomething = true;
    }

    const dismissFeatureTip = page
      .getByRole("button", {
        name: "Dismiss feature tip",
      })
      .first();
    if (
      await dismissFeatureTip.isVisible({ timeout: 500 }).catch(() => false)
    ) {
      await dismissFeatureTip.click();
      await dismissFeatureTip.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
      dismissedSomething = true;
    }

    if (!dismissedSomething) break;
  }
}
