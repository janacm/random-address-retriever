import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the web app's end-to-end tests.
 *
 * `webServer` boots the Vite dev server before the suite and tears it down
 * after, reusing an already-running server locally so `pnpm dev` + `pnpm
 * test:e2e` in two terminals also works. Tests that only exercise client-side
 * UI need nothing else; tests that hit `/api/*` additionally require the API
 * server (and Postgres) running — start everything with `pnpm dev` from the
 * repo root.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
