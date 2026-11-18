import { expect, test } from "@playwright/test";
import { splitTitle } from "@/components/ui/dialog-title";

// Task 0100: a dialog title that is an action and a name ("Edit Aluko Fuad") is split so the name can be drawn apart; any other title is left whole. The split must give back the exact
// same text, so a dialog's accessible name never changes.

const rejoin = (title: string) => {
  const parts = splitTitle(title);
  return parts ? `${parts.action} ${parts.name}${parts.tail}` : null;
};

test("an action and a person's name are split, and put back together they read exactly the title", () => {
  expect(splitTitle("Edit Aluko Fuad")).toEqual({ action: "Edit", name: "Aluko Fuad", tail: "" });
  expect(rejoin("Edit Aluko Fuad")).toBe("Edit Aluko Fuad");
  expect(splitTitle("History of Tola Teacher")).toEqual({ action: "History of", name: "Tola Teacher", tail: "" });
  expect(splitTitle("Standing history of Ada Obi")).toEqual({ action: "Standing history of", name: "Ada Obi", tail: "" });
});

test("a year, an invoice number or a class name counts as a name; a closing question mark stays outside it", () => {
  expect(splitTitle("Rename 2026/2027")?.name).toBe("2026/2027");
  expect(splitTitle("Invoice INV-0042")).toEqual({ action: "Invoice", name: "INV-0042", tail: "" });
  expect(splitTitle("Archive Nursery 1?")).toEqual({ action: "Archive", name: "Nursery 1", tail: "?" });
  expect(rejoin("Archive Nursery 1?")).toBe("Archive Nursery 1?");
});

test("a sentence is not split: a lower-case word after the action, an unknown action, a title with no name", () => {
  expect(splitTitle("Edit arm Main")).toBeNull();
  expect(splitTitle("Remove this branch?")).toBeNull();
  expect(splitTitle("New student")).toBeNull();
  expect(splitTitle("Edit")).toBeNull();
  expect(splitTitle("Editor Tola")).toBeNull();
});

test("every action word needs a space after it: 'Editing Ada' is not 'Edit' + 'ing Ada'", () => {
  expect(splitTitle("Editing Ada")).toBeNull();
  expect(splitTitle("Changed Ada")).toBeNull();
});
