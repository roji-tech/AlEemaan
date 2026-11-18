import { expect, test } from "@playwright/test";
import { pickTab, withTab } from "@/components/ui/tab-param";

// Task 0100: the open tab of a page lives in the address as ?tab=. These are the two rules behind it.

const IDS = ["classes", "subjects", "sessions"] as const;

test("a tab the page has is opened; anything else opens the fallback", () => {
  expect(pickTab("sessions", IDS, "classes")).toBe("sessions");
  expect(pickTab("subjects", IDS, "classes")).toBe("subjects");
  expect(pickTab(null, IDS, "classes")).toBe("classes");
  expect(pickTab(undefined, IDS, "classes")).toBe("classes");
  expect(pickTab("", IDS, "classes")).toBe("classes");
  expect(pickTab("staff", IDS, "classes"), "a tab this page does not have").toBe("classes");
  expect(pickTab("Sessions", IDS, "classes"), "the names are exact").toBe("classes");
  expect(pickTab("__proto__", IDS, "classes")).toBe("classes");
  expect(pickTab("constructor", IDS, "classes")).toBe("classes");
});

test("choosing a tab keeps the other parameters, sets tab, and drops the one-shot ones of an Overview link", () => {
  expect(withTab("", "sessions")).toBe("tab=sessions");
  expect(withTab("branch=b1&q=ada", "subjects")).toBe("branch=b1&q=ada&tab=subjects");
  expect(withTab("tab=classes&branch=b1", "sessions")).toBe("tab=sessions&branch=b1");
  expect(withTab("section=sessions&branch=b1&new=1", "classes"), "the older name and the 'open the form' flag are gone").toBe(
    "branch=b1&tab=classes",
  );
});

test("a value that is not plain text is encoded, never spliced into the address", () => {
  expect(withTab("", "a&b=c")).toBe("tab=a%26b%3Dc");
});
