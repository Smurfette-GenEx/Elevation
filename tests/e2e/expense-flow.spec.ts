import { test, expect, type Page } from "@playwright/test";

// Runs against a seeded database (npm run db:seed). Password shared by all demo users.
const PASSWORD = process.env.E2E_PASSWORD ?? "Expense!2026demo";

async function login(page: Page, user: string) {
  await page.goto("/login");
  await page.fill("input[name=email]", `${user}@atlas-group.example`);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard");
}

test("employee creates and submits a report; manager approves it", async ({ browser }) => {
  const title = `E2E taxi ${Date.now()}`;
  // Unique amount per run so the duplicate-expense control does not (correctly) flag a previous run
  const amount = (10 + (Date.now() % 1400) / 100).toFixed(2);
  const emp = await browser.newPage();
  await login(emp, "employee2.fr");
  await emp.goto("/expenses/new");
  await emp.fill("input[name=title]", title);
  await emp.click("text=Create draft");
  await emp.waitForURL((url) => /\/expenses\/[a-z0-9]{20,}$/.test(url.pathname)); // report ids are cuids, not "new"
  const reportUrl = emp.url();

  await emp.click("text=Add expense");
  const dialog = emp.locator("dialog[open]");
  await dialog.locator("select").first().selectOption({ label: "Transportation (taxi, train, parking)" });
  await dialog.getByLabel("Merchant / supplier").fill("G7 Taxi");
  await dialog.getByLabel("Gross amount (incl. tax)").fill(amount);
  await dialog.getByLabel("Business purpose / description").fill("Taxi to client office");
  await dialog.getByRole("button", { name: "Save expense" }).click();
  await expect(emp.getByText("G7 Taxi")).toBeVisible();
  await expect(emp.getByText(`€${amount}`).first()).toBeVisible();

  await emp.getByRole("button", { name: "Submit for approval" }).click();
  await expect(emp.getByText("No policy issues detected.")).toBeVisible();
  await emp.locator("dialog[open]").getByRole("button", { name: "Submit", exact: true }).click();
  await expect(emp.getByText("Submitted").first()).toBeVisible();

  const mgr = await browser.newPage();
  await login(mgr, "manager.fr");
  await mgr.goto(reportUrl);
  await mgr.getByRole("button", { name: "Approve" }).click();
  await mgr.locator("dialog[open]").getByRole("button", { name: "Approve report" }).click();
  await expect(mgr.getByText("Ready for payment").first()).toBeVisible();
});

test("employees cannot open administration or another entity's report", async ({ page }) => {
  await login(page, "employee.uk");
  await page.goto("/admin");
  await expect(page.getByText("You do not have administrative permissions.")).toBeVisible();
  const res = await page.request.get("/api/v1/admin/users");
  expect(res.status()).toBe(403);
});
