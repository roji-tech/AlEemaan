import "@/lib/zod-csp";
import { z } from "zod";
import { structureName, subjectCode } from "@/lib/academics/structure-rules";
import { splitTagCell, tagList } from "@/lib/academics/subject-catalog-rules";
import { blankToUndefined } from "./fields";
import { subjectColumns } from "./subjects";
import type { BulkColumn, BulkEntity } from "./types";

// The catalogue kind of the bulk entry (task 0119), client-safe: the subject columns plus an optional `Tags` column (semicolons between tags), with the single form's field rules. A
// superadmin loads the school's subjects here once; the branches then take them from the catalogue. What the database knows is in `subject-catalog-server.ts`.

export type SubjectCatalogRow = { name: string; code?: string; tags: string[] };

/// The optional Tags column: also the last column of a branch's subjects export (the branch import does not take it: tags belong to the catalogue, and it says so when it ignores the column).
export const subjectTagsColumn: BulkColumn = {
  key: "tags",
  label: "Tags",
  aliases: ["tag", "labels", "category", "categories"],
  required: false,
  help: "Labels separated by semicolons (core; basic); up to 10, letters, numbers, spaces and dashes; may be left empty",
};

export const subjectCatalogColumns: BulkColumn[] = [
  ...subjectColumns.map((c) => (c.key === "name" ? { ...c, help: "Up to 60 characters; not already in the catalogue" } : c)),
  subjectTagsColumn,
];

export const subjectCatalogRowSchema: z.ZodType<SubjectCatalogRow> = z.object({
  name: structureName,
  code: z.preprocess(blankToUndefined, subjectCode.optional()),
  tags: z.preprocess((v) => (typeof v === "string" ? splitTagCell(v) : (v ?? [])), tagList),
});

export const subjectCatalogEntity: BulkEntity<SubjectCatalogRow> = {
  id: "subject-catalog",
  label: "catalogue subjects",
  columns: subjectCatalogColumns,
  rowSchema: subjectCatalogRowSchema,
  uniqueKeys: ["name", "code"],
};
