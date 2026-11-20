import type { Definition, RowState } from "@/lib/results/school-templates-rules";
import { slugKey } from "@/lib/results/school-templates-rules";
import type { LayoutOptions } from "@/lib/results/templates-rules";

// What `GET /api/v1/school-templates` answers, and the small pure helpers the Results > School templates screens share (task 0120). Presentation only: the API decides who may do what.

export type SchoolBranchState = {
  branchId: string;
  branchName: string;
  templateId: string;
  version: number | null;
  state: RowState;
  classCount: number;
};
export type SchoolTemplateView = {
  id: string;
  name: string;
  description: string | null;
  layoutCode: string | null;
  layoutOptions: LayoutOptions | null;
  definition: Definition;
  version: number;
  archived: boolean;
  branches: SchoolBranchState[];
  missingBranches: { id: string; name: string }[];
};
export type SchoolTemplatesData = { branches: { id: string; name: string }[]; templates: SchoolTemplateView[] };

export const LAYOUT_NAMES: Record<string, string> = {
  DEFAULT: "Standard layout",
  LEGACY: "Legacy layout",
  PRESCHOOL: "Pre-school card",
  BASIC: "Basic class card",
  JUNIOR: "Junior secondary card",
  SENIOR: "Senior secondary card",
};
export const layoutName = (code: string | null): string => (code ? (LAYOUT_NAMES[code] ?? code) : "The branch's standard layout");

/// What one outcome of "Update branches" or "Add to branches" says, in words (the API's status codes are for machines).
export function outcomeText(status: string, reason?: string): { text: string; tone: "ok" | "skip" | "bad" } {
  switch (status) {
    case "ok":
      return { text: "Updated", tone: "ok" };
    case "added":
      return { text: "Added", tone: "ok" };
    case "up-to-date":
      return { text: "Already up to date", tone: "skip" };
    case "already":
      return { text: "Already has it", tone: "skip" };
    case "skipped-customised":
      return { text: "Skipped: customised in the branch", tone: "skip" };
    case "not-following":
      return { text: "Skipped: does not follow this template (add it instead)", tone: "skip" };
    case "clash":
      return { text: "Skipped: the branch has its own template with this name (rename or detach it first)", tone: "skip" };
    case "gone":
      return { text: "Skipped: no such branch", tone: "skip" };
    default:
      return { text: reason ? `Failed: ${reason}` : "Failed", tone: "bad" };
  }
}

/// A key for a new group or trait: the slug of its name, made unique among the keys already in use (a suffix of -2, -3...). Existing items keep their key when renamed: it is what ties their ratings.
export function freshKey(name: string, taken: ReadonlySet<string>): string {
  const base = slugKey(name) || "item";
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base.slice(0, 36)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base.slice(0, 30)}-${Date.now() % 100000}`;
}

export const EMPTY_DEFINITION: Definition = {
  scheme: { name: "", totalMax: 100, examMax: 60, components: [{ name: "Continuous assessment", maxScore: 40 }] },
  scale: {
    name: "",
    unconfirmed: false,
    bands: [
      { min: 0, max: 40, letter: "F", remark: "Fail" },
      { min: 40, max: 50, letter: "D", remark: "Fair" },
      { min: 50, max: 60, letter: "C", remark: "Good" },
      { min: 60, max: 70, letter: "B", remark: "Very good" },
      { min: 70, max: 100, letter: "A", remark: "Excellent" },
    ],
  },
  groups: [],
};
