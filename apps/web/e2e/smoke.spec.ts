import { expect, test } from "@playwright/test";

// Client-side smoke tests — no API/Postgres required. They exercise the
// landing CTA and the top-nav routing between the standalone pages.

test("landing page leads with the indexed-Canada hero and the CTA", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /indexed every real address in Canada/i })
  ).toBeVisible();

  // Province comes before City in the form's field order.
  const labels = await page
    .locator(".queryPanel .field > span:first-child")
    .allInnerTexts();
  expect(labels.slice(0, 2)).toEqual(["Province", "City"]);

  await expect(page.getByRole("button", { name: "Get address" })).toBeVisible();
});

test("top nav switches between API access and About", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "API access" }).click();
  await expect(
    page.getByRole("heading", { name: "Build on the address index" })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Want this for your country/i })).toBeVisible();

  await page.getByRole("button", { name: "About" }).click();
  await expect(
    page.getByRole("heading", { name: /Where these addresses come from/i })
  ).toBeVisible();
});

test("footer links reach the legal pages", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Terms of Service" }).click();
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();

  await page.getByRole("button", { name: "Privacy Policy" }).click();
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
});
