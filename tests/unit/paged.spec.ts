import "../support/env";
import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server";
import { pagedOk, readPage, slicePage } from "@/lib/api/paged";

// One shape for every paged list: ?page&limit in, { data: { <key>: rows }, meta: { page, limit, total, pages, hasNext } } out; a bad parameter is a 400 that names the field.

const request = (query: string) => new NextRequest(`http://localhost/api/v1/things${query}`);
const page = (query: string) => {
  const result = readPage(request(query));
  if (result instanceof Response) throw new Error("expected a page");
  return result;
};

test.describe("readPage", () => {
  test("defaults to page 1 and 25 rows; page and limit are read", () => {
    expect(page("")).toMatchObject({ page: 1, limit: 25, skip: 0, take: 25 });
    expect(page("?page=3&limit=10")).toMatchObject({ page: 3, limit: 10, skip: 20, take: 10 });
  });

  test("a route may set its own default and ceiling", () => {
    const own = readPage(request("?limit=60"), { defaultLimit: 20, maxLimit: 50 });
    expect(own).toBeInstanceOf(Response);
    const fine = readPage(request(""), { defaultLimit: 20, maxLimit: 50 });
    expect(fine).toMatchObject({ limit: 20 });
  });

  test("a bad value is a 400 VALIDATION naming the field as query.<name>, never clamped", async () => {
    for (const query of [
      "?page=0",
      "?page=-1",
      "?page=1.5",
      "?page=abc",
      "?page=1&page=2",
      "?limit=0",
      "?limit=101",
      "?limit=",
      "?page=1e3",
      "?limit=%2010",
    ]) {
      const result = readPage(request(query));
      expect(result, query).toBeInstanceOf(Response);
      const response = result as Response;
      expect(response.status, query).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("VALIDATION");
      expect(body.error.details[0].path).toMatch(/^query\.(page|limit)$/);
    }
  });
});

test.describe("pagedOk and slicePage", () => {
  test("the rows sit under the key; the paging facts sit under meta", async () => {
    const response = pagedOk("things", ["a", "b"], { page: 2, limit: 2 }, 5);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { things: ["a", "b"] },
      meta: { page: 2, limit: 2, total: 5, pages: 3, hasNext: true },
      error: null,
    });
  });

  test("the last page has no next; an empty list is one page, not zero", async () => {
    expect((await pagedOk("things", ["e"], { page: 3, limit: 2 }, 5).json()).meta).toMatchObject({ pages: 3, hasNext: false });
    expect((await pagedOk("things", [], { page: 1, limit: 25 }, 0).json()).meta).toMatchObject({ total: 0, pages: 1, hasNext: false });
  });

  test("slicePage takes one page out of a list that is already in memory and reports the whole count", () => {
    const all = Array.from({ length: 23 }, (_, i) => i + 1);
    expect(slicePage(all, page("?page=1&limit=10"))).toEqual({ items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], total: 23 });
    expect(slicePage(all, page("?page=3&limit=10"))).toEqual({ items: [21, 22, 23], total: 23 });
    expect(slicePage(all, page("?page=9&limit=10"))).toEqual({ items: [], total: 23 }); // past the end: nothing, still the true total
  });
});
