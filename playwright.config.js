import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:5173",
  },
  // Auto-start the Vite dev server the touch test runs against. Locally this
  // reuses a server you already have on :5173; in CI (no server running) it
  // boots one and tears it down after. Removes the old "needs dev server on
  // :5173" manual prerequisite.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
