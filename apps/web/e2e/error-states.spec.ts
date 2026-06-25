import { expect, test } from "@playwright/test";

// Error-state UX tests. They mock the `/api/*` routes with `page.route`, so they
// need no API server or Postgres — the focus is purely how the UI reacts to
// no-match, failures, and empty typeahead results.

const SUCCESS_BODY = {
  data: {
    address: "123 Test Street",
    city: "Burlington",
    province: "ON",
    postalCode: "L7R 2A1",
  },
  meta: { city: "Burlington", province: "ON", verbose: false, durationMs: 5 },
};

const NOT_FOUND_BODY = {
  error: {
    code: "not_found",
    message: "No address matched that city and province.",
  },
  meta: { city: "Faketownville", province: "ON" },
};

function jsonRoute(status: number, body: unknown) {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  } as const;
}

test("a city with no matches shows a clear error and clears the stale result", async ({
  page,
}) => {
  // Real city -> success; anything else -> 404. Order-independent.
  await page.route("**/api/random-address**", async (route) => {
    const url = route.request().url();
    await route.fulfill(
      url.includes("city=Burlington")
        ? jsonRoute(200, SUCCESS_BODY)
        : jsonRoute(404, NOT_FOUND_BODY)
    );
  });
  // Keep the typeahead hermetic — no real /api/cities calls.
  await page.route("**/api/cities**", (route) =>
    route.fulfill(jsonRoute(200, { data: [], meta: { count: 0 } }))
  );

  await page.goto("/");

  // 1) A real city returns an address.
  await page.getByRole("button", { name: "Get address" }).click();
  await expect(page.getByText("123 Test Street")).toBeVisible();

  // 2) Switch to a city that doesn't exist and retry.
  await page.locator("#city-input").fill("Faketownville");
  await page.getByRole("button", { name: "Get address" }).click();

  // The error state is front and center, names the query, and the previous
  // address is gone (so it can't be mistaken for the new result).
  await expect(page.getByText("No address found")).toBeVisible();
  await expect(
    page.getByText(/We couldn't find any addresses for "Faketownville, ON"/)
  ).toBeVisible();
  await expect(page.getByText("123 Test Street")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("an unreachable API surfaces a friendly failure message", async ({ page }) => {
  await page.route("**/api/random-address**", (route) => route.abort());
  await page.route("**/api/cities**", (route) =>
    route.fulfill(jsonRoute(200, { data: [], meta: { count: 0 } }))
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Get address" }).click();

  await expect(page.getByText("Couldn't reach the service")).toBeVisible();
});

test("the city typeahead reports when nothing matches", async ({ page }) => {
  await page.route("**/api/cities**", (route) =>
    route.fulfill(
      jsonRoute(200, {
        data: [],
        meta: { q: "zzqqxx", province: null, count: 0, durationMs: 1 },
      })
    )
  );

  await page.goto("/");
  await page.locator("#city-input").fill("Zzqqxx");

  await expect(page.getByText(/No cities found for/i)).toBeVisible();
});
