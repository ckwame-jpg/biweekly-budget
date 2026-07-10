// Real touch-event testing (Playwright's .tap(), not mouse clicks) against a
// mobile device profile. Requires the dev server running on :5173.
import { test, expect, devices } from "@playwright/test";

test.use({ ...devices["iPhone 13"] }); // hasTouch: true, isMobile: true, real viewport/UA

test("touch interactions work across the app on a touch-enabled mobile viewport", async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

  await page.goto("/");

  // dismiss the welcome sheet if it's showing (first-run only)
  const letsGo = page.getByRole("button", { name: "Let's go" });
  if (await letsGo.isVisible().catch(() => false)) {
    await letsGo.tap();
  }

  await expect(page.locator("h1")).toBeVisible();

  // tap through every bottom-nav tab and confirm the title actually changes
  const tabs = [
    { name: "Budget", title: "Budget" },
    { name: "Track", title: "Track spending" },
    { name: "Monthly", title: "Monthly" },
    { name: "Annual", title: "Annual" },
    { name: "Home", title: "Your money" },
  ];
  for (const tab of tabs) {
    await page.getByRole("button", { name: tab.name, exact: true }).tap();
    await expect(page.locator("h1")).toHaveText(tab.title);
  }

  // tap a NumInput on Budget and type into it via touch
  await page.getByRole("button", { name: "Budget", exact: true }).tap();
  const firstAmountInput = page.locator('input[inputmode="decimal"]').first();
  await firstAmountInput.tap();
  await firstAmountInput.fill("777");
  await expect(firstAmountInput).toHaveValue("777");

  // tap the header Save button (auto-save also runs, but this is the explicit one)
  await page.getByRole("button", { name: "Save", exact: true }).tap();

  // tap the settings gear to open, then tap its close (X) button — found via its
  // sibling relationship to the "Settings" label, since the sheet's content is
  // taller than the viewport (no backdrop area is actually reachable to tap instead)
  await page.locator('[data-tour="settings-gear"]').tap(); // gear, targeted by its stable tour anchor
  await expect(page.getByText("Settings", { exact: true })).toBeVisible();
  await page.getByText("Settings", { exact: true }).locator("xpath=following-sibling::button").tap();
  await expect(page.getByText("Settings", { exact: true })).toBeHidden();

  expect(pageErrors, "no uncaught page errors during touch flow").toEqual([]);
  expect(consoleErrors, "no console.error during touch flow").toEqual([]);
});
