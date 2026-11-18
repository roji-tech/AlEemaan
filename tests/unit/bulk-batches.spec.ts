import { expect, test } from "@playwright/test";
import { BATCH_SIZE, chunkRows } from "../../src/lib/bulk/batches";

// How a bulk save is cut up (task 0095): in order, nothing lost, nothing repeated, none larger than asked.
test.describe("bulk batches", () => {
  test("a batch is small enough that one transaction stays well inside its limit", () => {
    expect(BATCH_SIZE).toBeGreaterThan(0);
    expect(BATCH_SIZE).toBeLessThanOrEqual(25);
  });

  test("144 rows are 8 batches: seven of 20 and one of 4, in order", () => {
    const rows = Array.from({ length: 144 }, (_, i) => i + 1);
    const batches = chunkRows(rows);
    expect(batches.map((b) => b.length)).toEqual([20, 20, 20, 20, 20, 20, 20, 4]);
    expect(batches.flat()).toEqual(rows);
  });

  test("an empty list has no batches, an exact multiple has no short one, a size of 0 or less is read as 1", () => {
    expect(chunkRows([])).toEqual([]);
    expect(chunkRows([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(chunkRows([1, 2], 0)).toEqual([[1], [2]]);
  });

  test("every size from 1 to 30 over every length from 0 to 60 keeps every row once", () => {
    for (let size = 1; size <= 30; size++) {
      for (let n = 0; n <= 60; n++) {
        const rows = Array.from({ length: n }, (_, i) => i);
        const batches = chunkRows(rows, size);
        expect(batches.flat()).toEqual(rows);
        for (const b of batches) expect(b.length).toBeLessThanOrEqual(size);
      }
    }
  });
});
