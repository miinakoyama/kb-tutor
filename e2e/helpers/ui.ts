import type { BrowserContext, Page } from "@playwright/test";

const FEATURE_SPOTLIGHT_DISMISSED_KEYS = [
  "kb-tutor-spotlight-read-aloud-dismissed-v1",
  "kb-tutor-spotlight-notes-dismissed-v1",
  "kb-tutor-spotlight-sidebar-glossary-dismissed-v1",
  "kb-tutor-spotlight-inline-glossary-dismissed-v1",
  "kb-tutor-exam-onboarding-dismissed-v1",
] as const;

export async function disableOnboardingTour(context: BrowserContext): Promise<void> {
  await context.addInitScript((spotlightKeys: readonly string[]) => {
    const keyPrefix = "kb-tutor-onboarding-complete:";
    localStorage.setItem(`${keyPrefix}anonymous`, "1");
    for (const key of spotlightKeys) {
      localStorage.setItem(key, "1");
    }

    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function patchedGetItem(key: string): string | null {
      if (typeof key === "string" && key.startsWith(keyPrefix)) {
        return "1";
      }
      return originalGetItem.call(this, key);
    };
  }, FEATURE_SPOTLIGHT_DISMISSED_KEYS);
}

export async function dismissTourIfVisible(page: Page): Promise<void> {
  // Only dismiss known onboarding/tour UI. Do not match bare "Next"/"Continue"
  // app controls (practice/exam advance, assignment CTAs, etc.).
  for (let attempt = 0; attempt < 6; attempt += 1) {
    let dismissedSomething = false;

    const skipTour = page.getByRole("button", { name: "Skip tour" });
    if (await skipTour.isVisible({ timeout: 500 }).catch(() => false)) {
      await skipTour.click();
      await skipTour.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
      dismissedSomething = true;
    }

    const featureSpotlight = page.getByTestId("feature-spotlight");
    if (await featureSpotlight.isVisible({ timeout: 500 }).catch(() => false)) {
      const featureTipCta = featureSpotlight
        .getByRole("button", { name: /^(Got it|Next|Continue)$/ })
        .first();
      if (await featureTipCta.isVisible({ timeout: 500 }).catch(() => false)) {
        await featureTipCta.click();
        await featureSpotlight
          .waitFor({ state: "hidden", timeout: 5_000 })
          .catch(() => {});
        dismissedSomething = true;
      } else {
        const dismissFeatureTip = featureSpotlight
          .getByRole("button", { name: "Dismiss feature tip" })
          .first();
        if (
          await dismissFeatureTip.isVisible({ timeout: 500 }).catch(() => false)
        ) {
          await dismissFeatureTip.click();
          await featureSpotlight
            .waitFor({ state: "hidden", timeout: 5_000 })
            .catch(() => {});
          dismissedSomething = true;
        }
      }
    }

    if (!dismissedSomething) break;
  }
}
