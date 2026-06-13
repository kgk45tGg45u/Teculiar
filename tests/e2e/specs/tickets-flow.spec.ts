import { expect, test } from "@playwright/test";
import { LoginPage } from "../pages/login.page";

// Focused, UI-driven check of the customer ticket flow against the live site.
// Selectors are intentionally resilient so this passes against both the current
// production UI and the WhatsApp redesign once deployed:
//   • department dropdown: name="department" (legacy enum) OR name="departmentId" (dynamic)
//   • submit button: "Open Ticket"
//   • reply textarea: name="body"; reply button: "Send Reply" or "Send"
const CLIENT_EMAIL = process.env.E2E_CLIENT_EMAIL ?? "";
const CLIENT_PASSWORD = process.env.E2E_CLIENT_PASSWORD ?? "";

test.describe("Tickets flow (client portal)", () => {
  test.skip(!CLIENT_EMAIL || !CLIENT_PASSWORD, "Requires E2E_CLIENT_EMAIL / E2E_CLIENT_PASSWORD");

  test("client opens a ticket, sees the thread, and a reply posts", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto("client");
    await login.submit(CLIENT_EMAIL, CLIENT_PASSWORD, "client");

    await page.goto("/client/tickets/new");
    await page.waitForLoadState("networkidle");

    const subject = `E2E ticket flow ${Date.now()}`;

    const department = page.locator('select[name="departmentId"], select[name="department"]').first();
    await expect(department).toBeVisible();
    const options = await department
      .locator("option")
      .evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value).filter(Boolean));
    if (options.length > 0) {
      await department.selectOption(options[0]);
    }

    await page.getByLabel(/Subject/i).fill(subject);
    await page.getByLabel(/Message/i).fill("Automated end-to-end check of the ticket flow — safe to ignore.");
    await page.getByRole("button", { name: /Open Ticket|Start conversation/i }).click();

    // Lands on the ticket detail page, which shows the subject + opening message.
    await page.waitForURL(/\/client\/tickets\/[A-Za-z0-9]+$/, { timeout: 25_000 });
    await expect(page.locator("body")).toContainText(subject, { timeout: 15_000 });
    await expect(page.locator("body")).toContainText("Automated end-to-end check", { timeout: 15_000 });

    // Post a reply and confirm it appears in the thread.
    const replyText = `E2E reply ${Date.now()}`;
    const replyBox = page.locator('textarea[name="body"]').first();
    await expect(replyBox).toBeVisible();
    await replyBox.fill(replyText);
    await page.getByRole("button", { name: /^(Send Reply|Send)$/i }).first().click();
    await expect(page.locator("body")).toContainText(replyText, { timeout: 20_000 });

    // Best-effort: close the ticket so the test doesn't leave it open in the queue.
    const closeButton = page.getByRole("button", { name: /Close ticket/i });
    if (await closeButton.count()) {
      await closeButton.first().click().catch(() => undefined);
    }
  });
});
