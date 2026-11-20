# 0123: grade labels on classes

- **Status:** Done, in production once the maintainer merges the prod PR and runs the migration `20261122100000_class_grade_label`.

Asked 2026-11-20: "Grade labels on classes (JSS 1 = Grade 7) ... I also want the label to be displayed beside the name in the result template", optional.

## What it does
- `ClassGroup.gradeLabel` (nullable text, up to 30 characters): "Grade 7" for JSS 1, "Grade 10" for SSS 1. Empty = no label, and the class looks exactly as before.
- Set when adding or renaming a class (Academics > Classes), and by the classes file: a "Grade label" column in the import and in the export.
- Shown in brackets beside the class name wherever the class is named on a card: "JSS 1 (Grade 7)" (class card, report card and its download). `classText` in `report-card-rules.ts` builds it and writes "(Grade 10)", with no stray spaces.

## Checked
Structure API spec (the label saved, trimmed, cleared, exported), browser spec `class-grade-label.spec.ts`, report-card spec, unit sweep. A formatting slip on `report-traits.ts` that CI caught was fixed in #335.

## Not done
Classes created before this have no label until someone sets it (or imports the file).
