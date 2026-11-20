import type { Reply } from "@/components/auth/postJson";
import type { ClassRef, CoverageRow, LayoutOptions } from "@/lib/results/templates-rules";
import type { RowState } from "@/lib/results/school-templates-rules";

// What `GET /api/v1/results/templates` answers, and the one call that places classes, shared by the Templates view and the Classes tab (task 0116). Presentation only: the API decides.

export type TemplateView = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  archived: boolean;
  layoutCode: string | null;
  layoutOptions: LayoutOptions | null;
  scheme: { id: string; name: string; archived: boolean } | null;
  gradeScale: { id: string; name: string; archived: boolean } | null;
  classGroupIds: string[];
  /// The school-wide template this row follows, and where it stands against it (task 0120); null for a template of the branch's own.
  school?: {
    id: string;
    name: string;
    version: number;
    rowVersion: number | null;
    archived: boolean;
    state: RowState;
    label: string;
  } | null;
};
/// Which grade scale a class grades on and from where (its own, its template's, the branch's default); `unconfirmed` when its bands are still a guess.
export type CoverageScale = {
  id: string;
  name: string | null;
  source: "class" | "template" | "branch";
  archived: boolean;
  unconfirmed: boolean;
};
export type TemplatesData = {
  templates: TemplateView[];
  classes: ClassRef[];
  coverage: (CoverageRow & { classScaleId: string | null; scale: CoverageScale | null })[];
  unplaced: number;
  choices: {
    layouts: { code: string; name: string }[];
    schemes: { id: string; name: string; note: string }[];
    scales: { id: string; name: string; isDefault: boolean; unconfirmed: boolean }[];
    /// Earlier versions of a grade scale that were never confirmed (marks graded on them cannot be published until they are).
    earlierUnconfirmed: { id: string; name: string; version: number }[];
  };
};

/// "Class leaves Template" lines of a refused move (409 CONFIRM_MOVES), one per class.
export const moveLines = (reply: Reply): string[] => (reply.code === "CONFIRM_MOVES" ? (reply.details ?? []).map((d) => d.message) : []);

export const LAYOUT_OPTION_LABELS: { key: keyof LayoutOptions; label: string }[] = [
  { key: "logo", label: "School logo" },
  { key: "signatureLine", label: "Signature line" },
  { key: "nextTermDate", label: "Next-term resumption date" },
  { key: "classArm", label: "Class arm (the A of SSS 1 A)" },
  { key: "verifyLinks", label: "Verify these results (a link for each subject)" },
];

/// A template's look in words.
export function lookText(t: Pick<TemplateView, "layoutCode" | "layoutOptions">, layouts: { code: string; name: string }[]): string {
  if (!t.layoutCode) return "The branch's standard layout";
  const name = layouts.find((l) => l.code === t.layoutCode)?.name ?? t.layoutCode;
  return name;
}
