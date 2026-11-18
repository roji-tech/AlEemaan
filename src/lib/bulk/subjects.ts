import "@/lib/zod-csp";
import { z } from "zod";
import { structureName, subjectCode } from "@/lib/academics/structure-rules";
import { blankToUndefined } from "./fields";
import type { BulkColumn, BulkEntity } from "./types";

// The subject kind of the bulk entry (task 0084, requested 2026-11-17), client-safe: the SAME field rules as the single form (`structure-rules.ts`). What the database knows (a live
// subject of the branch already has the name or the code) and the save are in `subjects-server.ts`.

export type SubjectRow = { name: string; code?: string };

export const subjectColumns: BulkColumn[] = [
  {
    key: "name",
    label: "Subject",
    aliases: ["subjectname", "title"],
    required: true,
    help: "Up to 60 characters; not already a subject of the branch",
  },
  {
    key: "code",
    label: "Code",
    aliases: ["subjectcode", "short"],
    required: false,
    help: "Up to 12 letters, numbers, dots, dashes or underscores; may be left empty",
  },
];

export const subjectRowSchema: z.ZodType<SubjectRow> = z.object({
  name: structureName,
  code: z.preprocess(blankToUndefined, subjectCode.optional()),
});

export const subjectEntity: BulkEntity<SubjectRow> = {
  id: "subjects",
  label: "subjects",
  columns: subjectColumns,
  rowSchema: subjectRowSchema,
  uniqueKeys: ["name", "code"],
};
