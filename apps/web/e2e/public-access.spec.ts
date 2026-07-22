import { expect, test } from "@playwright/test";

test("the branded date ritual opens the public sign-in route", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Some doors open with a shared memory." })).toBeVisible();
  await page.getByLabel("Combination month").fill("1");
  await page.getByLabel("Combination day").fill("16");
  await page.getByLabel("Combination year").fill("1985");
  await page.getByRole("button", { name: "Turn the key" }).click();
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
});

test("a roster-miss registration receives the same generic public response", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Full name on the alumni roster").fill("Synthetic Graduate");
  await page.getByLabel("Email address on the alumni roster").fill("synthetic.graduate@example.test");
  await page.getByLabel("Create password").fill("SyntheticPass1985");
  await page.getByLabel("Confirm password").fill("SyntheticPass1985");
  await page.getByRole("button", { name: "Request access" }).click();
  await expect(page.getByRole("status")).toContainText("If the information matches our alumni records");
});

test("protected content redirects anonymous visitors before rendering data", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByText("Community foundation")).toHaveCount(0);
});

test("public routes do not overflow a phone viewport", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile-specific layout assertion.");
  for (const route of ["/", "/login", "/register"]) {
    await page.goto(route);
    const widths = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  }
});
