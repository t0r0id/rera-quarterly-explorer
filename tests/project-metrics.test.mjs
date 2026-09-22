import { test } from "node:test";
import assert from "node:assert/strict";
import { inventoryStats, latestBooking, numeric, quarterlyInventoryStats, totalUnits, value } from "../lib/project-metrics.ts";

const orchard = {
  "Project Name": "GODREJ LAKESIDE ORCHARD",
  "Approved On": "2024-09-30",
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
    inventory: 970, reportedInventory: 970, booked: 837, unsold: 133, pct: 837 / 970 * 100,
  });
});

test("previous-quarter fallback pairs booked and available from that quarter", () => {
  const project = { ...orchard, "Units Booked (Q1_FY26-27)": "NA" };
  assert.equal(totalUnits(project), 970);
  assert.equal(latestBooking(project).quarter, "Q4 FY25–26");
  assert.equal(value(project, "bookedPercent"), 678 / 970 * 100);
  const q3 = { "Approved On": "2025-01-01", "Total Units": "200", "Units Booked (Q3_FY25-26)": "40", "Units Available (Q3_FY25-26)": "60" };
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
  assert.equal(totalUnits({ "Approved On": "2025-01-01", "Total Units": "698", "Units Booked (Q1_FY26-27)": "0", "Units Available (Q1_FY26-27)": "0" }), 0);
  assert.equal(numeric(""), null);
  assert.equal(numeric(undefined), null);
  assert.equal(numeric("1,200"), 1200);
});

test("no quarterly booking retains project inventory but excludes it from published inventory", () => {
  const unpublished = { "Approved On": "2025-01-01", "Total Units": "200" };
  assert.equal(totalUnits(unpublished), 200);
  assert.equal(value(unpublished, "bookedPercent"), null);
  assert.deepEqual(inventoryStats([orchard, unpublished]), {
    inventory: 1170, reportedInventory: 970, booked: 837, unsold: 133, pct: 837 / 970 * 100,
  });
  assert.equal(totalUnits({ "Approved On": "2025-01-01", "Total Units": "NA" }), null);
});

test("dated metrics use same-quarter inventory and bookings without carrying reports forward", () => {
  const oldReport = { "Approved On": "2025-01-01", "Total Units": "150", "Units Booked (Q4_FY25-26)": "20", "Units Available (Q4_FY25-26)": "80" };
  assert.deepEqual(quarterlyInventoryStats([orchard, oldReport], "Q4_FY25-26"), {
    inventory: 1070, reportedInventory: 1070, booked: 698, unsold: 372, pct: 698 / 1070 * 100,
  });
  assert.deepEqual(quarterlyInventoryStats([orchard, oldReport], "Q1_FY26-27"), {
    inventory: 1120, reportedInventory: 970, booked: 837, unsold: 133, pct: 837 / 970 * 100,
  });
  assert.deepEqual(quarterlyInventoryStats([orchard], "Q3_FY25-26"), {
    inventory: 698, reportedInventory: 0, booked: null, unsold: null, pct: null,
  });
});

test("dated metrics distinguish zero sales from missing sales and fall back to project inventory", () => {
  assert.deepEqual(quarterlyInventoryStats([{ "Approved On": "2025-01-01", "Total Units": "120", "Units Booked (Q3_FY25-26)": "0" }], "Q3_FY25-26"), {
    inventory: 120, reportedInventory: 120, booked: 0, unsold: null, pct: 0,
  });
});

test("unsold uses availability from the selected report and never infers missing values", () => {
  assert.equal(inventoryStats([orchard]).unsold, 133);
  assert.equal(inventoryStats([{ ...orchard, "Units Booked (Q1_FY26-27)": "NA" }]).unsold, 292);
  assert.equal(inventoryStats([{ ...orchard, "Units Available (Q1_FY26-27)": "NA" }]).unsold, null);
  assert.equal(inventoryStats([{ ...orchard, "Units Available (Q1_FY26-27)": "0" }]).unsold, 0);
  assert.equal(quarterlyInventoryStats([{ ...orchard, "Units Available (Q4_FY25-26)": "0" }], "Q4_FY25-26").unsold, 0);
  assert.equal(quarterlyInventoryStats([{ ...orchard, "Units Booked (Q1_FY26-27)": "NA" }], "Q1_FY26-27").unsold, null);
});

test("March carries December booked, inventory and availability together, marking table fallback", () => {
  const december = { "Approved On": "2025-01-01", "Total Units": "150", "Units Booked (Q3_FY25-26)": "20", "Units Available (Q3_FY25-26)": "80" };
  assert.deepEqual(quarterlyInventoryStats([orchard, december], "Q4_FY25-26"), {
    inventory: 1070, reportedInventory: 1070, booked: 698, unsold: 372, pct: 698 / 1070 * 100,
  });
  assert.equal(value(december, "Units Booked (Q4_FY25-26)"), 20);
  // A March zero is a report; missing March availability does not borrow December's.
  const march = { ...december, "Units Booked (Q4_FY25-26)": "0" };
  assert.deepEqual(quarterlyInventoryStats([march], "Q4_FY25-26"), {
    inventory: 150, reportedInventory: 150, booked: 0, unsold: null, pct: 0,
  });
});

test("dated Inventory includes unreported projects while the sales denominator excludes them", () => {
  const december = { "Approved On": "2025-01-01", "Total Units": "150", "Units Booked (Q3_FY25-26)": "20", "Units Available (Q3_FY25-26)": "80" };
  const unpublished = { "Approved On": "2025-01-01", "Total Units": "250" };
  for (const suffix of ["Q3_FY25-26", "Q4_FY25-26"]) {
    assert.deepEqual(quarterlyInventoryStats([december, unpublished], suffix), {
      inventory: 350, reportedInventory: 100, booked: 20, unsold: 80, pct: 20,
    });
  }
});

test("historical inventory includes the period-end date but excludes approvals after it", () => {
  const projects = [
    { "Approved On": "2025-12-31", "Total Units": "100" },
    { "Approved On": "2026-01-01", "Total Units": "200" },
    { "Approved On": "2026-03-31", "Total Units": "300" },
    { "Approved On": "2026-04-01", "Total Units": "400" },
  ];
  assert.equal(quarterlyInventoryStats(projects, "Q3_FY25-26").inventory, 100);
  assert.equal(quarterlyInventoryStats(projects, "Q4_FY25-26").inventory, 600);
  assert.equal(inventoryStats(projects).inventory, 1000);
});

test("post-period approvals cannot contribute reported inventory, sales, or unsold units", () => {
  const report = { "Total Units": "900", "Units Booked (Q3_FY25-26)": "20", "Units Available (Q3_FY25-26)": "80" };
  const eligible = { ...report, "Approved On": "2025-12-31" };
  const later = { ...report, "Approved On": "2026-04-01" };
  const unknown = { ...report, "Approved On": "NA" };
  for (const suffix of ["Q3_FY25-26", "Q4_FY25-26"]) {
    assert.deepEqual(quarterlyInventoryStats([eligible, later, unknown], suffix), {
      inventory: 100, reportedInventory: 100, booked: 20, unsold: 80, pct: 20,
    });
  }
});

test("historical cutoff also respects the caller's approval-date filter", () => {
  const projects = [
    { "Approved On": "2024-12-31", "Total Units": "50" },
    { "Approved On": "2025-01-01", "Total Units": "100" },
    { "Approved On": "2026-01-01", "Total Units": "200" },
  ].filter(project => project["Approved On"] >= "2025-01-01");
  assert.equal(quarterlyInventoryStats(projects, "Q3_FY25-26").inventory, 100);
  assert.equal(quarterlyInventoryStats(projects, "Q4_FY25-26").inventory, 300);
});
