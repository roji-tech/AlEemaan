import { test, expect } from "../support/fixtures";
import { Role, createUser, resetDatabase, seedInstance, DEFAULT_PASSWORD } from "../support/db";
import { signInThroughUi } from "./helpers";

// Task 0053: the Broadcast Composer says what happened. The API's answer is replaced here (the real answer is tested in tests/api/communication.spec.ts and the gateways in
// tests/unit/communication-fail-closed.spec.ts), so that the three messages are seen as the administrator sees them: everything sent, some failed, nothing sent.

const ENDPOINT = "**/api/v1/communication/broadcast";
const REASON = "Email is not set up on this server (RESEND_API_KEY is not set). Nothing was sent.";

test.afterAll(async () => {
  await resetDatabase();
});

test.beforeEach(async () => {
  await resetDatabase();
  await seedInstance();
});

const answer = (data: Record<string, unknown>) => ({
  status: 201,
  contentType: "application/json",
  body: JSON.stringify({ data: { dispatches: [], ...data }, meta: {}, error: null }),
});

test("the composer says what happened: all sent, some failed, none sent; the text is kept when anything failed", async ({ page }) => {
  const admin = await createUser({ role: Role.ADMIN, name: "Comm Admin", superAdmin: false });
  await signInThroughUi(page, { email: admin.email, password: DEFAULT_PASSWORD });
  await page.goto("/communication");
  await expect(page.getByRole("heading", { name: "Communication" })).toBeVisible();
  const message = page.getByLabel("Message Content");
  const send = page.getByRole("button", { name: "Send Broadcast" });
  const alert = page.locator("form").getByRole("alert");

  // everything was sent: the panel moves to the dispatch log, where the sends are (as it always did)
  await page.route(ENDPOINT, (route) => route.fulfill(answer({ count: 3, sent: 3, failed: 0, firstError: null })));
  await message.fill("School resumes on Monday.");
  await send.click();
  await expect(page.getByRole("tab", { name: "Message Logs & Dispatches" })).toHaveAttribute("aria-selected", "true");

  // some failed: the composer stays, says how many of each and why, and the text is kept
  await page.getByRole("tab", { name: "Broadcast Composer" }).click();
  await page.unroute(ENDPOINT);
  await page.route(ENDPOINT, (route) => route.fulfill(answer({ count: 3, sent: 1, failed: 2, firstError: REASON })));
  await message.fill("Second notice.");
  await send.click();
  await expect(alert).toHaveText(`Sent to 1, failed for 2. ${REASON} Details are in Message Logs & Dispatches.`);
  await expect(alert).not.toContainText("successfully");
  await expect(page.getByRole("tab", { name: "Broadcast Composer" })).toHaveAttribute("aria-selected", "true");
  await expect(message).toHaveValue("Second notice.");

  // none sent: the broadcast is said not to have been sent, with the reason, and the text is kept
  await page.unroute(ENDPOINT);
  await page.route(ENDPOINT, (route) => route.fulfill(answer({ count: 2, sent: 0, failed: 2, firstError: REASON })));
  await send.click();
  await expect(alert).toHaveText(`The broadcast was not sent. ${REASON} Details are in Message Logs & Dispatches.`);
  await expect(message).toHaveValue("Second notice.");
});
