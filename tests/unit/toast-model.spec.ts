import { expect, test } from "@playwright/test";
import { MAX_TOASTS, addToast, lifetimeMs, roleOf, type Toast } from "../../src/components/ui/toast-model";

// The pure rules of the toaster (task 0096): how long a toast stays, how many show, what a repeat does, and what a screen reader is told.
const toast = (id: number, text: string, variant: Toast["variant"] = "success"): Toast => ({ id, variant, text });

test.describe("toast model", () => {
  test("an error stays longest, a success shortest, and every toast goes by itself", () => {
    expect(lifetimeMs("success")).toBeLessThan(lifetimeMs("info"));
    expect(lifetimeMs("info")).toBeLessThan(lifetimeMs("warning"));
    expect(lifetimeMs("warning")).toBeLessThan(lifetimeMs("error"));
    for (const v of ["success", "info", "warning", "error"] as const) {
      expect(lifetimeMs(v)).toBeGreaterThanOrEqual(4_000); // long enough to read
      expect(lifetimeMs(v)).toBeLessThanOrEqual(15_000);
    }
  });

  test("what went wrong interrupts a screen reader; what went right waits its turn", () => {
    expect(roleOf("error")).toBe("alert");
    expect(roleOf("warning")).toBe("alert");
    expect(roleOf("success")).toBe("status");
    expect(roleOf("info")).toBe("status");
  });

  test("toasts are added in order and the oldest go beyond the limit", () => {
    let list: Toast[] = [];
    for (let i = 1; i <= MAX_TOASTS + 2; i++) list = addToast(list, toast(i, `message ${i}`));
    expect(list).toHaveLength(MAX_TOASTS);
    expect(list.map((t) => t.id)).toEqual([3, 4, 5, 6]);
  });

  test("the same message is not stacked twice: the new one replaces the old and goes last", () => {
    let list = addToast([], toast(1, "Saved."));
    list = addToast(list, toast(2, "Something else."));
    list = addToast(list, toast(3, "Saved."));
    expect(list.map((t) => [t.id, t.text])).toEqual([
      [2, "Something else."],
      [3, "Saved."],
    ]);
  });

  test("the same words with another variant are a different toast, and a title tells two apart", () => {
    let list = addToast([], toast(1, "Done.", "success"));
    list = addToast(list, toast(2, "Done.", "error"));
    list = addToast(list, { ...toast(3, "Done.", "success"), title: "Pupils" });
    expect(list).toHaveLength(3);
  });

  test("the list given is never changed", () => {
    const before = [toast(1, "a")];
    const copy = [...before];
    addToast(before, toast(2, "b"));
    expect(before).toEqual(copy);
  });
});
