import "@/lib/zod-csp";
import { z } from "zod";
import { structureName } from "@/lib/academics/structure-rules";
import { listItems, optionalText, repeatedItems } from "./fields";
import type { BulkColumn, BulkEntity } from "./types";

// The class kind of the bulk entry (task 0084, requested 2026-11-17), client-safe: one row is one class, with its arms and the subjects it studies written in one cell each ("A, B, C").
// The SAME name rule as the single form. What the database knows (the class exists already; a subject name that is not a subject of the branch) and the save are in
// `classes-server.ts`. A class that exists is refused, not extended: this adds classes.

export const MAX_ARMS = 30;
export const MAX_SUBJECTS_PER_CLASS = 100;
export type ClassRow = { name: string; gradeLabel?: string; arms: string[]; subjects: string[] };

export const classColumns: BulkColumn[] = [
  {
    key: "name",
    label: "Class",
    aliases: ["classname", "class group", "level"],
    required: true,
    help: "Up to 60 characters; not already a class of the branch",
  },
  {
    key: "gradeLabel",
    label: "Grade label",
    aliases: ["grade", "gradelevel", "year", "yeargroup"],
    required: false,
    help: "Optional second name, like Grade 7 for JSS 1 (up to 30 characters); shown beside the class name on the report card",
  },
  {
    key: "arms",
    label: "Arms",
    aliases: ["armnames", "divisions", "sections"],
    required: false,
    help: `Names separated by commas, e.g. A, B, C (up to ${MAX_ARMS}); may be left empty`,
  },
  {
    key: "subjects",
    label: "Subjects",
    aliases: ["subjectnames", "courses"],
    required: false,
    help: "Names of subjects that already exist in the branch, separated by commas; may be left empty",
  },
];

const listOf = (what: string, max: number) =>
  z.preprocess(
    listItems,
    z
      .array(structureName, { error: "Write the names separated by commas." })
      .max(max, `Use at most ${max}.`)
      .superRefine((items, ctx) => {
        const twice = repeatedItems(items);
        if (twice.length > 0)
          ctx.addIssue({ code: "custom", message: `${twice.join(", ")} ${twice.length === 1 ? "is" : "are"} written twice in ${what}.` });
      }),
  );

export const classRowSchema: z.ZodType<ClassRow> = z.object({
  name: structureName,
  gradeLabel: optionalText(30),
  arms: listOf("the arms", MAX_ARMS).default([]),
  subjects: listOf("the subjects", MAX_SUBJECTS_PER_CLASS).default([]),
}) as unknown as z.ZodType<ClassRow>;

export const classEntity: BulkEntity<ClassRow> = {
  id: "classes",
  label: "classes",
  columns: classColumns,
  rowSchema: classRowSchema,
  uniqueKeys: ["name"],
};
