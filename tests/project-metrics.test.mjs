import { test } from "node:test";
import assert from "node:assert/strict";
import { inventoryStats, latestBooking, numeric, totalUnits, value } from "../lib/project-metrics.ts";

const orchard = {
  "Project Name": "GODREJ LAKESIDE ORCHARD",
  "Total Units": "698",
  "Units Booked (Q1_FY26-27)": "837",
  "Units Available (Q1_FY26-27)": "133",
  "Units Booked (Q4_FY25-26)": "678",
  "Units Available (Q4_FY25-26)": "292",
};

test("Orchard uses 970 across displayed units, percentage, and aggregates", () => {
  assert.equal(totalUnits(orchard), 970);
  assert.equal(value(orchard, "Total Units"), 970);
  assert.equal(value(orchard, "bookedPercent").toFixed(1), "86.3");
  assert.deepEqual(inventoryStats([orchard]), {
    inventory: 970, reportedInventory: 970, booked: 837, pct: 837 / 970 * 100,
  });
});

test("previous-quarter fallback pairs booked and available from that quarter", () => {
  const project = { ...orchard, "Units Booked (Q1_FY26-27)": "NA" };
  assert.equal(totalUnits(project), 970);
  assert.equal(latestBooking(project).quarter, "Q4 FY25–26");
  assert.equal(value(project, "bookedPercent"), 678 / 970 * 100);
  const q3 = { "Total Units": "200", "Units Booked (Q3_FY25-26)": "40", "Units Available (Q3_FY25-26)": "60" };
  assert.equal(totalUnits(q3), 100);
});

test("missing availability falls back to project details without mixing quarters", () => {
  for (const missing of ["", " ", "NA", "-"]) {
    assert.equal(totalUnits({ ...orchard, "Units Available (Q1_FY26-27)": missing }), 698);
  }
});

test("published zeros remain valid and blanks are not interpreted as zero", () => {
  assert.equal(totalUnits({ ...orchard, "Units Available (Q1_FY26-27)": "0" }), 837);
  assert.equal(totalUnits({ ...orchard, "Units Booked (Q1_FY26-27)": "0" }), 133);
  assert.equal(totalUnits({ "Total Units": "698", "Units Booked (Q1_FY26-27)": "0", "Units Available (Q1_FY26-27)": "0" }), 0);
  assert.equal(numeric(""), null);
  assert.equal(numeric(undefined), null);
  assert.equal(numeric("1,200"), 1200);
});

test("no quarterly booking retains project inventory but excludes it from published inventory", () => {
  const unpublished = { "Total Units": "200" };
  assert.equal(totalUnits(unpublished), 200);
  assert.equal(value(unpublished, "bookedPercent"), null);
  assert.deepEqual(inventoryStats([orchard, unpublished]), {
    inventory: 1170, reportedInventory: 970, booked: 837, pct: 837 / 970 * 100,
  });
  assert.equal(totalUnits({ "Total Units": "NA" }), null);
});
