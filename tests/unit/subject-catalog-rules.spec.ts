import { test, expect } from "@playwright/test";
import {
  MAX_TAGS,
  addToBranchesInput,
  availableQuery,
  catalogInput,
  catalogPatch,
  fromCatalogInput,
  listQuery,
  normalizeTag,
  planAdd,
  renameClashMessage,
  renameClashes,
  sameName,
  splitTagCell,
  tagList,
} from "@/lib/academics/subject-catalog-rules";
import { validateRows } from "@/lib/bulk/validate";
import { exportTable } from "@/lib/bulk/list-export";
import { subjectCatalogEntity } from "@/lib/bulk/subject-catalog";
import type { SourceRow } from "@/lib/bulk/types";

// The shared subject catalogue's rules (task 0119): no database, no server.

const entry = { id: "e1", name: "English Language", code: "ENG" };

test("two names are the same subject ignoring case and the spaces at the ends", () => {
  expect(sameName(" English Language ", "english language")).toBe(true);
  expect(sameName("English", "English Language")).toBe(false);
});

test("planAdd: already, link, clash, create, and the code left off when the branch uses it", () => {
  expect(planAdd(entry, [{ id: "s1", name: "Maths", code: null, catalogId: "e1" }])).toEqual({ kind: "already" });
  // the branch's live subject of the same name, not linked: linked, not duplicated
  expect(planAdd(entry, [{ id: "s2", name: "english language", code: null, catalogId: null }])).toEqual({ kind: "link", subjectId: "s2" });
  // the same name but linked to ANOTHER entry: a clash
  expect(planAdd(entry, [{ id: "s3", name: "English Language", code: null, catalogId: "other" }])).toEqual({ kind: "clash" });
  expect(planAdd(entry, [])).toEqual({ kind: "create", withCode: true });
  // the code is taken by another subject of the branch: created without it
  expect(planAdd(entry, [{ id: "s4", name: "Phonics", code: "ENG", catalogId: null }])).toEqual({ kind: "create", withCode: false });
  // an entry without a code never has one to leave off
  expect(planAdd({ ...entry, code: null }, [])).toEqual({ kind: "create", withCode: false });
});

test("renameClashes: the branches where the new name would clash with ANOTHER live subject, once each, sorted", () => {
  const linked = [
    { branchId: "b2", branchName: "Zaria", subjectId: "s2" },
    { branchId: "b1", branchName: "Abuja", subjectId: "s1" },
    { branchId: "b3", branchName: "Kano", subjectId: "s3" },
  ];
  const live = new Map([
    [
      "b1",
      [
        { id: "s1", name: "English Language" },
        { id: "x1", name: "english" },
      ],
    ],
    ["b2", [{ id: "s2", name: "English Language" }]],
    [
      "b3",
      [
        { id: "s3", name: "English" },
        { id: "x3", name: "ENGLISH" },
      ],
    ],
  ]);
  // renaming to "English": Abuja has another (x1), Kano has another (x3), Zaria has none
  expect(renameClashes(linked, live, "English")).toEqual(["Abuja", "Kano"]);
  // renaming to its own current name never clashes with itself
  expect(renameClashes([linked[0]!], live, "English Language")).toEqual([]);
  expect(renameClashMessage(["Abuja"])).toBe("Not renamed: this branch already has another subject with that name: Abuja.");
  expect(renameClashMessage(["Abuja", "Kano"])).toContain("these branches already have");
});

test("tags: lower-cased, trimmed, spaces made one, repeats dropped; letters, digits, spaces and dashes only; at most 10 of 30", () => {
  expect(normalizeTag("  Pre   School ")).toBe("pre school");
  expect(tagList.parse([" Core", "core", "Pre-school", "ARABIC"])).toEqual(["core", "pre-school", "arabic"]);
  expect(tagList.parse([])).toEqual([]);
  expect(tagList.safeParse(["ok", "bad_tag"]).success).toBe(false);
  expect(tagList.safeParse(["<script>"]).success).toBe(false);
  expect(tagList.safeParse(["-leading"]).success).toBe(false);
  expect(tagList.safeParse(["x".repeat(30)]).success).toBe(true);
  expect(tagList.safeParse(["x".repeat(31)]).success).toBe(false);
  // a blank entry is dropped, not refused (a cell "core;;basic" or a trailing comma is a slip, not an error)
  expect(tagList.parse(["   ", "core", ""])).toEqual(["core"]);
  const ten = Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`);
  expect(tagList.safeParse(ten).success).toBe(true);
  expect(tagList.safeParse([...ten, "one-more"]).success).toBe(false);
  // repeats do not count twice
  expect(tagList.safeParse([...ten, "T0"]).success).toBe(true);
  // a huge payload is refused before it is looked at
  expect(tagList.safeParse(Array.from({ length: 500 }, (_, i) => `t${i}`)).success).toBe(false);
  expect(splitTagCell(" core ; basic;;  ")).toEqual(["core", "basic"]);
});

test("the request bodies are strict and bounded", () => {
  expect(catalogInput.safeParse({ name: "English", code: "eng", tags: ["Core"] }).data).toEqual({
    name: "English",
    code: "ENG",
    tags: ["core"],
  });
  expect(catalogInput.safeParse({ name: "English", extra: 1 }).success).toBe(false);
  expect(catalogInput.safeParse({ name: "" }).success).toBe(false);
  expect(catalogInput.safeParse({ name: "x".repeat(61) }).success).toBe(false);
  expect(catalogPatch.safeParse({}).success).toBe(false);
  expect(catalogPatch.safeParse({ archived: true }).success).toBe(true);
  expect(catalogPatch.safeParse({ tags: [] }).success).toBe(true);
  // "rename in every branch" needs a name
  expect(catalogPatch.safeParse({ renameInBranches: true }).success).toBe(false);
  expect(catalogPatch.safeParse({ name: "English", renameInBranches: true }).success).toBe(true);
  expect(addToBranchesInput.safeParse({ branchIds: [] }).success).toBe(false);
  expect(addToBranchesInput.safeParse({ branchIds: Array.from({ length: 51 }, (_, i) => `b${i}`) }).success).toBe(false);
  expect(addToBranchesInput.safeParse({ branchIds: ["b1"] }).success).toBe(true);
  expect(fromCatalogInput.safeParse({ branchId: "b1", catalogIds: [] }).success).toBe(false);
  expect(fromCatalogInput.safeParse({ branchId: "b1", catalogIds: Array.from({ length: 51 }, (_, i) => `c${i}`) }).success).toBe(false);
  expect(fromCatalogInput.safeParse({ branchId: "b1", catalogIds: ["c1"], extra: true }).success).toBe(false);
  expect(availableQuery.safeParse({ branchId: "b1", tag: "Core" }).data).toEqual({ branchId: "b1", tag: "core" });
  expect(listQuery.safeParse({ q: "eng", archived: "true", tag: "basic" }).success).toBe(true);
  expect(listQuery.safeParse({ archived: "maybe" }).success).toBe(false);
});

const row = (values: Record<string, string>, line = 2): SourceRow => ({
  line,
  values: { name: "Mathematics", code: "", tags: "", ...values },
});

test("the catalogue file: Subject, Code and an optional Tags column with semicolons, the single form's rules", () => {
  expect(subjectCatalogEntity.columns.map((c) => c.key)).toEqual(["name", "code", "tags"]);
  expect(subjectCatalogEntity.columns.find((c) => c.key === "tags")?.required).toBe(false);
  const ok = validateRows(subjectCatalogEntity, [row({ code: "mth", tags: "Core; Basic ;core" })]);
  expect(ok.verdicts[0]?.status).toBe("ready");
  expect(ok.ok[0]?.row).toEqual({ name: "Mathematics", code: "MTH", tags: ["core", "basic"] });
  expect(validateRows(subjectCatalogEntity, [row({ tags: "" })]).ok[0]?.row.tags).toEqual([]);
  const bad = validateRows(subjectCatalogEntity, [row({ tags: "good; bad_tag" })]);
  expect(bad.verdicts[0]?.status).toBe("error");
  expect(bad.verdicts[0]?.problems.some((p) => p.column === "tags")).toBe(true);
  const eleven = validateRows(subjectCatalogEntity, [row({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`).join(";") })]);
  expect(eleven.verdicts[0]?.status).toBe("error");
  // a repeated name inside the file is found, ignoring case
  const twice = validateRows(subjectCatalogEntity, [row({ name: "English" }, 2), row({ name: "english" }, 3)]);
  expect(twice.verdicts.filter((v) => v.status === "error")).toHaveLength(1);
});

test("a branch's subjects export carries the tags as a last column", () => {
  const table = exportTable("subjects", [{ name: "English", code: "ENG", tags: "core; basic" }]);
  expect(table.headers).toEqual(["Subject", "Code", "Tags"]);
  expect(table.rows).toEqual([["English", "ENG", "core; basic"]]);
});
