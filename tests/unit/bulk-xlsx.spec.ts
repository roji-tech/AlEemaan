import { test, expect } from "@playwright/test";
import { inflateRawSync } from "node:zlib";
import writeXlsxFile from "write-excel-file/universal";
import { buildWorkbook, fitsInlineList, readXlsx } from "@/lib/bulk/xlsx";
import { staffColumns } from "@/lib/bulk/staff";

// Excel files (task 0084 D5, D10): read the first sheet as text, write a workbook whose fixed-value columns are dropdowns.

/// The text of one file inside an .xlsx (a zip), read straight from the central directory: the test needs to look INSIDE the workbook, which no reader exposes.
function unzipText(zip: Buffer, name: string): string {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const entry = zip.subarray(p + 46, p + 46 + nameLen).toString();
    if (entry === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      return (method === 8 ? inflateRawSync(data) : data).toString("utf8");
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`no ${name} in the workbook`);
}
const bufferOf = async (blob: Blob) => Buffer.from(await blob.arrayBuffer());

test("a workbook reads back as the same text, cell for cell, first sheet only", async () => {
  const headers = ["First name", "Last name", "Phone"];
  const rows = [
    ["Amina", "Yusuf", "08031234567"],
    ["Bala", "", "+2348031234567"],
  ];
  const blob = await buildWorkbook(staffColumns, headers, rows);
  const back = await readXlsx(await blob.arrayBuffer());
  expect(back.slice(0, 3)).toEqual([headers, rows[0], rows[1]]);
});

test("the phone typed as text keeps its leading zero, and a number cell comes out as plain digits, never an exponent", async () => {
  const blob = await writeXlsxFile([
    [{ value: "Phone", type: String }],
    [{ value: 8031234567, type: Number }],
    [{ value: "08031234567", type: String }],
  ]).toBlob();
  expect(await readXlsx(await blob.arrayBuffer())).toEqual([["Phone"], ["8031234567"], ["08031234567"]]);
});

test("the fixed-value columns are dropdowns in the workbook: the category's and the gender's lists are their labels (task 0111 added Gender), and nothing else is a list", async () => {
  const blob = await buildWorkbook(
    staffColumns,
    staffColumns.map((c) => c.label),
    [],
  );
  const xml = unzipText(await bufferOf(blob), "xl/worksheets/sheet1.xml");
  const lists = xml.match(/<dataValidation [^>]*type="list"[^>]*>/g) ?? [];
  expect(lists).toHaveLength(2);
  expect(xml).toContain("Teaching staff");
  expect(xml).toContain("Non-teaching staff");
  expect(xml).toMatch(/sqref="A2:A1001"/); // Category, column A
  expect(xml).toContain("Male");
  expect(xml).toMatch(/sqref="G2:G1001"/); // Gender, column G (after Category, First name, Last name, Phone, Email, Title)
});

test("something that is not an .xlsx file is refused, not read as garbage", async () => {
  await expect(readXlsx(new TextEncoder().encode("a,b\n1,2").buffer as ArrayBuffer)).rejects.toThrow();
});

test("Excel keeps a dropdown as one comma-separated string of at most 255 characters: a longer list, or a value with a comma, gets no dropdown instead of a damaged file", async () => {
  expect(fitsInlineList(["Male", "Female"])).toBe(true);
  expect(fitsInlineList([])).toBe(false);
  expect(fitsInlineList(["JSS 1", "Hifz, A"])).toBe(false);
  const many = Array.from({ length: 40 }, (_, i) => `Class number ${i}`);
  expect(many.join(",").length).toBeGreaterThan(255);
  expect(fitsInlineList(many)).toBe(false);
  const columns = [
    { key: "c", label: "Class", aliases: [], required: false, help: "", options: many.map((v) => ({ value: v, label: v })) },
  ];
  const xml = unzipText(await bufferOf(await buildWorkbook(columns, ["Class"], [])), "xl/worksheets/sheet1.xml");
  expect(xml).not.toContain('type="list"');
});
