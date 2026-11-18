import { test, expect } from "@playwright/test";
import { loginPathFor, safeReturnTo } from "@/lib/auth/return-to";

// "Take me back to the page I was on" after signing in: only a path inside this site is ever followed.

test("an in-site path, with its query, is kept", () => {
  for (const ok of ["/students", "/students?page=2&q=ada", "/branches/abc123", "/users#top", "/results/export?term=1"])
    expect(safeReturnTo(ok), ok).toBe(ok);
});

test("anything that could leave the site is refused", () => {
  const bad = [
    "//evil.example",
    "//evil.example/path",
    "/\\evil.example",
    "/\\\\evil.example",
    "https://evil.example",
    "http://localhost:3000/students",
    "javascript:alert(1)",
    "students",
    "",
    " /students",
    "/students\r\nSet-Cookie: x=1",
    "/students\u0000",
    "/students\u2028",
    "/" + "a".repeat(600),
  ];
  for (const value of bad) expect(safeReturnTo(value), JSON.stringify(value).slice(0, 40)).toBeNull();
  for (const value of [undefined, null, 5, {}, ["/students"]]) expect(safeReturnTo(value)).toBeNull();
});

test("the sign-in pages themselves, the API and setup are never returned to (they would loop or leak)", () => {
  for (const value of [
    "/login",
    "/login?next=/students",
    "/login/mfa",
    "/api/v1/auth/me",
    "/setup",
    "/logout",
    "/forgot-password",
    "/reset-password",
  ]) {
    expect(safeReturnTo(value), value).toBeNull();
  }
  expect(safeReturnTo("/loginhelp")).toBe("/loginhelp"); // only the exact page and what is under it
});

test("the dashboard is where it goes anyway, so it adds nothing to the address", () => {
  expect(safeReturnTo("/dashboard")).toBeNull();
  expect(loginPathFor("/dashboard")).toBe("/login");
});

test("loginPathFor encodes the path and falls back to the plain sign-in page", () => {
  expect(loginPathFor("/students?page=2&q=a b")).toBe("/login?next=%2Fstudents%3Fpage%3D2%26q%3Da%20b");
  expect(loginPathFor("//evil.example")).toBe("/login");
  expect(loginPathFor(null)).toBe("/login");
});
