import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? "3100");
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const SHOULD_START_WEB_SERVER = !process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  ...(SHOULD_START_WEB_SERVER
    ? {
        webServer: {
          command: `npm run build && npm run start -- --port ${PORT}`,
          url: `${BASE_URL}/login`,
          reuseExistingServer: false,
          timeout: 240_000,
          env: {
            ...process.env,
            E2E_AUTH_BYPASS: "1",
          },
        },
      }
    : {}),
});
