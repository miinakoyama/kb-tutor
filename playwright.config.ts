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
            NEXT_PUBLIC_E2E_AUTH_BYPASS: "1",
            // Provide safe placeholders so server-side env guards do not crash
            // in CI where Supabase vars are intentionally absent for E2E.
            NEXT_PUBLIC_SUPABASE_URL:
              process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
            NEXT_PUBLIC_SUPABASE_ANON_KEY:
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "e2e-anon-key",
            SUPABASE_SERVICE_ROLE_KEY:
              process.env.SUPABASE_SERVICE_ROLE_KEY ?? "e2e-service-role-key",
          },
        },
      }
    : {}),
});
