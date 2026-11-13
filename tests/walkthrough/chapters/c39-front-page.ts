import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast } from "../cast";
import { signIn, signOut } from "./shared";

// C39 The front page (task 0033, section 6.39): what a visitor sees when they type the site's address, in English and in Arabic (right to left), where its sign-in and portal links lead, and what a signed-in person is given
// instead; and the video guide, which the profile menu links to.

const chapter = "C39 Front page";

export async function c39FrontPage(walk: Walk, page: Page): Promise<void> {
  let front: Page = page;

  await walk.step(
    {
      id: 356,
      chapter,
      role: "Visitor",
      title: "The site's address shows a visitor the school's front page and every way in",
      caption:
        "Typed with nobody signed in, the school's address shows its front page: what it offers, who it is for, the branches, and the ways in. Sign in appears in the header, the hero, the closing band and the footer, and the parent and pupil portal in two places.",
      covers: ["RTE-02", "LND-01"],
    },
    async () => {
      await signOut(walk, page);
      front = await walk.typedAddress(`${new URL(page.url()).origin}/`);
      await expect(front.getByRole("banner")).toHaveCount(1);
      await expect(front.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
      await expect(front.getByRole("contentinfo")).toContainText(`© ${new Date().getFullYear()}`);
      const signInLinks = front.getByRole("link", { name: "Sign in", exact: true });
      await expect(signInLinks).toHaveCount(4);
      await expect(signInLinks.first()).toHaveAttribute("href", "/login");
      await expect(front.getByRole("link", { name: "Parent and pupil portal" })).toHaveCount(2);
    },
  );

  await walk.step(
    {
      id: 357,
      chapter,
      role: "Visitor",
      title: "The front page in Arabic, right to left, and the link back to English",
      caption:
        "The header's Arabic link, written in Arabic, opens the same page in Arabic and right to left, with its own way in. Its English link brings the visitor back.",
      covers: ["RTE-03"],
    },
    async () => {
      await walk.click(front.getByRole("banner").getByRole("link", { name: "العربية", exact: true }));
      await expect(front).toHaveURL(/\/ar$/);
      await expect(front.locator('div[lang="ar"][dir="rtl"]')).toBeVisible();
      await expect(front.getByRole("link", { name: "تسجيل الدخول", exact: true })).toHaveCount(4);
      await walk.click(front.getByRole("banner").getByRole("link", { name: "English", exact: true }));
      await expect(front.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(4);
    },
  );

  await walk.step(
    {
      id: 358,
      chapter,
      role: "Superadmin",
      title: "A signed-in person who types the address lands on the overview; the profile menu leads to the video guide",
      caption:
        "Typed after signing in, the school's address does not show the front page: it leads straight to the overview. The profile menu has a Video guide link, and it opens the video guide page.",
      covers: ["RTE-02", "VID-02"],
    },
    async () => {
      await walk.closeTypedAddress();
      await signIn(walk, page, cast.superadmin);
      front = await walk.typedAddress(`${new URL(page.url()).origin}/`);
      await expect(front).toHaveURL(/\/dashboard$/);
      await walk.closeTypedAddress();
      await walk.click(page.getByRole("button", { name: /^Account menu for/ }));
      await expect(page.getByRole("link", { name: "Video guide" })).toHaveAttribute("href", "/video-guide");
      await walk.click(page.getByRole("link", { name: "Video guide" }));
      await expect(page).toHaveURL(/\/video-guide$/);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    },
  );
}
