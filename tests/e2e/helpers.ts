import type { Locator, Page } from "@playwright/test";
import { expect } from "../support/fixtures";

/// Alerts in the page's <main>. Next.js also renders its own (empty)
/// `<next-route-announcer role="alert">` outside <main>, so a bare
/// getByRole("alert") is ambiguous.
export const alerts = (page: Page) => page.getByRole("main").getByRole("alert");

/// The alert containing `text` (a page can show several, e.g. the HTTP warning plus an error).
export const alertWith = (page: Page, text: string | RegExp) => alerts(page).filter({ hasText: text });

export const emailField = (page: Page) => page.getByLabel("Email address", { exact: true });
export const passwordField = (page: Page) => page.getByLabel("Password", { exact: true });
export const signInButton = (page: Page) => page.getByRole("button", { name: "Sign in", exact: true });
/// The "Keep me signed in on this device" checkbox (unchecked by default).
export const keepSignedInBox = (page: Page) => page.getByLabel("Keep me signed in on this device");

export async function fillCredentials(page: Page, email: string, password: string) {
  await emailField(page).fill(email);
  await passwordField(page).fill(password);
}

/// `remember: true` ticks "Keep me signed in" first (a persistent cookie + the long policy);
/// the default leaves it as the screen does — unchecked (a session cookie + a 12-hour cap).
export async function signInThroughUi(page: Page, user: { email: string; password: string }, opts: { remember?: boolean } = {}) {
  await page.goto("/login");
  await fillCredentials(page, user.email, user.password);
  if (opts.remember) await keepSignedInBox(page).check();
  await signInButton(page).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
}

/// Signs out through whatever this repo's signed-in screens offer: a "Sign out" button in the header
/// (Octalve Edu, until its app shell arrives with §0.5.2) or the account menu of the app shell
/// (AlEemaan; on a phone too — the avatar menu is in the top bar at every width).
export async function signOut(page: Page) {
  const direct = page.getByRole("button", { name: "Sign out" });
  const menu = page.getByRole("button", { name: /^Account menu for/ });
  await expect(direct.or(menu)).toBeVisible();
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Sign out" }).click();
}

// --- Two-step verification (plan §0.5.D) -------------------------------------------------------------------
export const codeField = (page: Page) => page.getByLabel("Authentication code");
export const recoveryField = (page: Page) => page.getByLabel("Recovery code");
export const verifyButton = (page: Page) => page.getByRole("button", { name: "Verify", exact: true });
export const mfaHeading = (page: Page) => page.getByRole("heading", { level: 1, name: "Two-step verification" });

/// Signs in through BOTH steps: password, then a code (`{ code }`) or a recovery code (`{ recoveryCode }`).
export async function signInWithSecondFactor(
  page: Page,
  user: { email: string; password: string },
  factor: { code: string } | { recoveryCode: string },
  opts: { remember?: boolean } = {},
) {
  await page.goto("/login");
  await fillCredentials(page, user.email, user.password);
  if (opts.remember) await keepSignedInBox(page).check();
  await signInButton(page).click();
  await expect(mfaHeading(page)).toBeVisible();
  if ("recoveryCode" in factor) {
    await page.getByRole("button", { name: "Use a recovery code instead" }).click();
    await recoveryField(page).fill(factor.recoveryCode);
  } else {
    await codeField(page).fill(factor.code);
  }
  await verifyButton(page).click();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
}

/// Requests the page makes to the login API, for "did it send anything?" checks.
export function trackLoginRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (req) => {
    if (req.url().endsWith("/api/v1/auth/login")) requests.push(req.method());
  });
  return requests;
}

// --- The Users page's row actions live behind one "Actions for <person>" button (a list that opens and closes). ---------------------------------------------------------------
// (The person is group 1 after a verb, or group 2 in "Add <person> to another branch", where the name sits in the middle.)
const ROW_ACTION =
  /^(?:(?:Change role or branch for|Deactivate|Reactivate|Suspend|Terminate|Standing history of|Make superadmin|Remove superadmin from) (.+)|Add (.+) to another branch)$/;

/// Opens the Actions list of `person` unless it is already open. False when the person has no Actions button at all (themselves, or someone the caller may not touch).
export async function openRowActions(page: Page, person: string): Promise<boolean> {
  // The list loads after the page: wait for the person's row before asking whether it has a button.
  await page.getByRole("listitem").filter({ hasText: person }).first().waitFor();
  const button = page.getByRole("button", { name: `Actions for ${person}`, exact: true });
  if ((await button.count()) === 0) return false;
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  return true;
}

/// Clicks a row action by its full accessible name ("Deactivate Tola Teacher"), opening that person's list first.
export async function rowAction(page: Page, label: string): Promise<void> {
  const match = ROW_ACTION.exec(label);
  if (!match) throw new Error(`not a row action: ${label}`);
  const person = match[1] ?? match[2];
  expect(await openRowActions(page, person), `${person} has an Actions button`).toBe(true);
  await page.getByRole("button", { name: label, exact: true }).click();
}

/// True when the row action is offered: the person has an Actions list and it holds that item. Leaves the list open.
export async function hasRowAction(page: Page, label: string): Promise<boolean> {
  const match = ROW_ACTION.exec(label);
  if (!match) throw new Error(`not a row action: ${label}`);
  if (!(await openRowActions(page, match[1] ?? match[2]))) return false;
  return (await page.getByRole("button", { name: label, exact: true }).count()) > 0;
}

/// Opens a tab and waits until it is the selected one. A tap that lands before the page's scripts are running is lost (2026-11-19: on the phone, the first tap on the off-screen Staff
/// tab right after Academics loads changed nothing, no error, and a second tap worked); tapping again until it holds is what a person does too.
export async function openTab(scope: Page | Locator, name: string | RegExp): Promise<void> {
  const tab = scope.getByRole("tab", { name, exact: typeof name === "string" });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
}

/// The Users page keeps the pending invitations on their own tab ("Pending invitations (2)"): opens it.
export async function openInvitationsTab(page: Page): Promise<void> {
  await page.getByRole("tab", { name: /^Pending invitations/ }).click();
}

/// Clicks an action of a row, a card or a term by its accessible name, opening the three-dots menu that holds it when it is not on the screen (task 0100: two or more actions of an item
/// are folded into one "Actions for <name>" button). `scope` is the page or one item; give an item when the page has several, so only its own menu is opened. A button that is already
/// on the screen is clicked as it is. Throws when no menu in the scope holds the action.
export async function clickAction(scope: Page | Locator, name: string | RegExp, options: { exact?: boolean } = {}): Promise<void> {
  const wanted = scope.getByRole("button", { name, exact: options.exact });
  const dots = scope.getByRole("button", { name: /^Actions for /, expanded: false });
  // The lists load after the page: wait until either the button or some three-dots button is there before deciding which it is.
  await wanted.or(dots).first().waitFor();
  if ((await wanted.count()) > 0) {
    await wanted.first().click();
    return;
  }
  const count = await dots.count();
  for (let i = 0; i < count; i++) {
    const trigger = dots.nth(i);
    await trigger.click();
    if ((await wanted.count()) > 0) {
      await wanted.first().click();
      return;
    }
    await trigger.press("Escape");
  }
  throw new Error(`no action named ${String(name)} on the screen or in any of its ${count} menus`);
}

/// Opens the three-dots menu of one item (the page when it has only one), for a test that looks at what the menu holds. Leaves it open; returns the three-dots button.
export async function openMenu(scope: Page | Locator, name?: string | RegExp): Promise<Locator> {
  const trigger = scope.getByRole("button", { name: name ?? /^Actions for /, expanded: false }).first();
  await trigger.click();
  return trigger;
}

/// Chooses a branch in the page's branch bar ("BRANCH: <name> [Switch branch]"; our own dropdown since task 0100, no longer a native select): opens the list and picks the branch.
export async function switchBranch(scope: Page | Locator, name: string): Promise<void> {
  await scope.getByRole("button", { name: "Switch branch" }).click();
  await scope.getByRole("list", { name: "Branches" }).getByRole("button", { name, exact: true }).click();
}
