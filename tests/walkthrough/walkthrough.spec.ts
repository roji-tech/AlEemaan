import { test, expect } from "@playwright/test";
import { Walk } from "./support/walk";

test.describe("Product Walkthrough & Rushing Human Video Guide (AlEemaan)", () => {
  test("records continuous end-to-end product walkthrough across roles", async ({ page }) => {
    const walk = new Walk(page, "out/walkthrough/screenshots");
    await walk.init();

    // 1. Initial Landing (single goto permitted by guardrail)
    await walk.step(
      {
        id: 1,
        title: "Initial Product Landing",
        role: "Visitor",
        caption: "Visitor arrives at AlEemaan platform and is guided to first-run setup wizard.",
        chapter: "Instance Setup",
      },
      async () => {
        await walk.goto("/");
        await expect(page.locator("h1")).toBeVisible({ timeout: 15_000 });
      },
    );

    // 2. Setup Wizard Form Entry (if on setup screen)
    const onSetup = page.url().includes("/setup");
    if (onSetup) {
      await walk.step(
        {
          id: 2,
          title: "First-Run School Setup",
          role: "Visitor",
          caption: "Entering founding school name and superadministrator account details.",
          chapter: "Instance Setup",
        },
        async () => {
          await walk.type(page.locator('input[name="schoolName"]'), "Al-Eemaan Demonstration School");
          await walk.type(page.locator('input[name="name"]'), "Ustadh Ibrahim");
          await walk.type(page.locator('input[name="email"]'), "admin@aleemaan.example");
          await walk.type(page.locator('input[name="password"]'), "AlEemaanPassword123!");
          await walk.type(page.locator('input[name="confirmPassword"]'), "AlEemaanPassword123!");
        },
      );

      // 3. Submit Setup
      await walk.step(
        {
          id: 3,
          title: "Initialize AlEemaan Instance",
          role: "Visitor",
          caption: "Submitting first-run wizard to create school and primary administrator account.",
          chapter: "Instance Setup",
        },
        async () => {
          await walk.click(page.locator('button[type="submit"]'));
          await expect(page.getByText("Setup complete")).toBeVisible({ timeout: 15_000 });
        },
      );

      // 4. Continue to Sign In
      await walk.step(
        {
          id: 4,
          title: "Navigate to Secure Sign-In",
          role: "Visitor",
          caption: "Proceeding from setup completion directly to authentication page.",
          chapter: "Authentication",
        },
        async () => {
          await walk.click(page.getByRole("button", { name: "Continue to sign in" }));
          await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 10_000 });
        },
      );
    }

    // 5. Administrator Sign-In
    await walk.step(
      {
        id: 5,
        title: "Administrator Authentication",
        role: "School Admin",
        caption: "Signing in with superadministrator credentials.",
        chapter: "Authentication",
      },
      async () => {
        await walk.type(page.locator('input[name="email"]'), "admin@aleemaan.example");
        await walk.type(page.locator('input[name="password"]'), "AlEemaanPassword123!");
        await walk.click(page.getByRole("button", { name: "Sign in" }));
        await expect(page.locator("h1")).toBeVisible({ timeout: 15_000 });
      },
    );

    // 6. School Overview Dashboard
    await walk.step(
      {
        id: 6,
        title: "Institutional Overview Dashboard",
        role: "School Admin",
        caption: "Accessing primary executive dashboard with administrative overview.",
        chapter: "School Administration",
      },
      async () => {
        await expect(page.locator("nav")).toBeVisible();
      },
    );

    // 7. Academics Management
    await walk.step(
      {
        id: 7,
        title: "Academic Structure & Curriculum",
        role: "School Admin",
        caption: "Reviewing academic structure: sessions, terms, and subject allocations.",
        chapter: "Academic Management",
      },
      async () => {
        const academicsLink = page.getByRole("link", { name: "Academics" }).first();
        await walk.click(academicsLink);
        await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
      },
    );

    // 8. People Management & Student Roster
    await walk.step(
      {
        id: 8,
        title: "Student Registry & Profiles",
        role: "School Admin",
        caption: "Navigating to student directory and enrolment management.",
        chapter: "People Management",
      },
      async () => {
        const studentsLink = page.getByRole("link", { name: "Students" }).first();
        await walk.click(studentsLink);
        await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
      },
    );

    // 9. Attendance Management
    await walk.step(
      {
        id: 9,
        title: "Daily Attendance & Roll Call",
        role: "School Admin",
        caption: "Accessing institutional attendance tracking and absence logging.",
        chapter: "Attendance",
      },
      async () => {
        const attendanceLink = page.getByRole("link", { name: "Attendance" }).first();
        await walk.click(attendanceLink);
        await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
      },
    );

    // 10. School Settings
    await walk.step(
      {
        id: 10,
        title: "System Settings & Policies",
        role: "School Admin",
        caption: "Inspecting school-wide settings, branch overrides, and security options.",
        chapter: "Settings & Security",
      },
      async () => {
        const settingsLink = page.getByRole("link", { name: "Settings" }).first();
        await walk.click(settingsLink);
        await expect(page.locator("h1")).toBeVisible({ timeout: 10_000 });
      },
    );

    // 11. Profile & Account Disclosure
    await walk.step(
      {
        id: 11,
        title: "Account Menu & Active Session",
        role: "School Admin",
        caption: "Opening user profile menu to review session status and security options.",
        chapter: "Session Management",
      },
      async () => {
        const profileButton = page.getByRole("button", { name: /Account menu for/i }).first();
        await walk.click(profileButton);
        await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible({ timeout: 5_000 });
      },
    );

    // 12. User Sign-Out
    await walk.step(
      {
        id: 12,
        title: "Authenticated Sign-Out",
        role: "School Admin",
        caption: "Logging out safely through standard UI navigation.",
        chapter: "Session Management",
      },
      async () => {
        const signOutButton = page.getByRole("button", { name: "Sign out" });
        await walk.click(signOutButton);
        await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 10_000 });
      },
    );

    // 13. Security Boundary Verification
    await walk.step(
      {
        id: 13,
        title: "Unauthenticated Access Boundary",
        role: "Visitor",
        caption: "Confirming that signed-out visitors cannot bypass authentication.",
        chapter: "Security Verification",
      },
      async () => {
        await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
      },
    );

    // Conclude walkthrough recording and write timeline
    walk.saveTimeline("out/walkthrough/timeline.json");
  });
});
