import { expect, test } from "@playwright/test";
import {
  defaultSize,
  pageAfterResize,
  pageList,
  pageRange,
  paginate,
  parseChoice,
  SIZES,
  sizeAfterViewChange,
  storeChoice,
} from "../../src/components/ui/collection-model";

// The pure rules of the list/grid kit (task 0089): sizes, the remembered choice, page numbers, and where the reader is after a change of view or size.
test.describe("collection model", () => {
  test("sizes: 12 divides into every grid column count; the server's cap of 50 holds for every size", () => {
    expect(SIZES.list).toEqual([10, 25, 50]);
    expect(SIZES.grid).toEqual([12, 24, 48]);
    for (const n of [...SIZES.list, ...SIZES.grid]) expect(n).toBeLessThanOrEqual(50);
    for (const columns of [1, 2, 3, 4, 6]) expect(12 % columns).toBe(0);
  });

  test("the default size is the list's own choice when it exists, else the first", () => {
    expect(defaultSize("list")).toBe(10);
    expect(defaultSize("grid")).toBe(12);
    expect(defaultSize("list", 25)).toBe(25);
    expect(defaultSize("list", 13)).toBe(10);
    expect(defaultSize("grid", 25)).toBe(12); // 25 is a list size
  });

  test("the remembered choice: what was written comes back; anything else is the default, field by field", () => {
    expect(parseChoice(null, "grid")).toEqual({ view: "grid", size: 12 });
    expect(parseChoice(storeChoice({ view: "list", size: 25 }), "grid")).toEqual({ view: "list", size: 25 });
    expect(parseChoice(null, "list", 25)).toEqual({ view: "list", size: 25 });
    expect(parseChoice("not json", "list")).toEqual({ view: "list", size: 10 });
    expect(parseChoice("[]", "list")).toEqual({ view: "list", size: 10 });
    expect(parseChoice('{"view":"table","size":10}', "grid")).toEqual({ view: "grid", size: 12 });
    expect(parseChoice('{"size":24}', "grid")).toEqual({ view: "grid", size: 24 }); // a good size survives a missing view
    expect(parseChoice('{"view":"list","size":12}', "grid")).toEqual({ view: "list", size: 10 }); // 12 is not a list size
    expect(parseChoice('{"view":"grid","size":"24"}', "list")).toEqual({ view: "grid", size: 12 }); // a string is not a number
  });

  test("changing the view keeps 'more per page' meaning more per page", () => {
    expect(sizeAfterViewChange("list", 10, "grid")).toBe(12);
    expect(sizeAfterViewChange("list", 25, "grid")).toBe(24);
    expect(sizeAfterViewChange("grid", 48, "list")).toBe(50);
    expect(sizeAfterViewChange("grid", 7, "list")).toBe(10); // an unknown size falls to the first
  });

  test("after a change of size the reader stays on the first item they were looking at", () => {
    expect(pageAfterResize(3, 10, 12)).toBe(2); // item 21 is on page 2 of 12
    expect(pageAfterResize(1, 10, 25)).toBe(1);
    expect(pageAfterResize(5, 25, 10)).toBe(11); // item 101
    expect(pageAfterResize(0, 10, 12)).toBe(1);
  });

  test("the range text", () => {
    expect(pageRange(2, 12, 57)).toEqual({ from: 13, to: 24 });
    expect(pageRange(5, 12, 57)).toEqual({ from: 49, to: 57 });
    expect(pageRange(1, 12, 0)).toEqual({ from: 0, to: 0 });
  });

  test("page numbers: all of them when there are few; the ends, the current page and its neighbours, with gaps, when there are many", () => {
    expect(pageList(1, 1)).toEqual([1]);
    expect(pageList(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pageList(5, 10)).toEqual([1, "gap", 4, 5, 6, "gap", 10]);
    expect(pageList(1, 10)).toEqual([1, 2, 3, 4, "gap", 10]);
    expect(pageList(4, 10)).toEqual([1, 2, 3, 4, 5, "gap", 10]); // a one-page hole is the page, not a gap
    expect(pageList(10, 10)).toEqual([1, "gap", 7, 8, 9, 10]);
    for (let pages = 1; pages <= 40; pages++) {
      for (let page = 1; page <= pages; page++) {
        const numbers = pageList(page, pages).filter((n): n is number => n !== "gap");
        expect(numbers, `${page} of ${pages}`).toContain(page);
        expect(numbers[0]).toBe(1);
        expect(numbers.at(-1)).toBe(pages);
        expect([...numbers].sort((a, b) => a - b)).toEqual(numbers); // ascending, no repeats
        expect(new Set(numbers).size).toBe(numbers.length);
      }
    }
  });

  test("paginate keeps the page inside what exists", () => {
    const items = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(paginate(items, 3, 12)).toMatchObject({ page: 3, pages: 3 });
    expect(paginate(items, 3, 12).rows).toHaveLength(6);
    expect(paginate(items, 9, 12).page).toBe(3);
    expect(paginate(items, 0, 12).page).toBe(1);
    expect(paginate([], 4, 12)).toEqual({ rows: [], page: 1, pages: 1 });
  });
});
