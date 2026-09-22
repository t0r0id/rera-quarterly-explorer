import { test } from "node:test";
import assert from "node:assert/strict";
import { inventoryShares, inventoryStats, latestBooking, numeric, projectCountForPeriod, quarterlyInventoryStats, totalUnits, value } from "../lib/project-metrics.ts";

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
    inventory: 970, reportedInventory: 970, unknownInventory: 0, booked: 837, unsold: 133, pct: 837 / 970 * 100,
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
    inventory: 1170, reportedInventory: 970, unknownInventory: 200, booked: 837, unsold: 133, pct: 837 / 1170 * 100,
  });
  assert.equal(totalUnits({ "Approved On": "2025-01-01", "Total Units": "NA" }), null);
});

test("dated metrics use same-quarter inventory and bookings without carrying reports forward", () => {
  const oldReport = { "Approved On": "2025-01-01", "Total Units": "150", "Units Booked (Q4_FY25-26)": "20", "Units Available (Q4_FY25-26)": "80" };
  assert.deepEqual(quarterlyInventoryStats([orchard, oldReport], "Q4_FY25-26"), {
    inventory: 1070, reportedInventory: 1070, unknownInventory: 0, booked: 698, unsold: 372, pct: 698 / 1070 * 100,
  });
  assert.deepEqual(quarterlyInventoryStats([orchard, oldReport], "Q1_FY26-27"), {
    inventory: 1120, reportedInventory: 970, unknownInventory: 150, booked: 837, unsold: 133, pct: 837 / 1120 * 100,
  });
  assert.deepEqual(quarterlyInventoryStats([orchard], "Q3_FY25-26"), {
    inventory: 698, reportedInventory: 0, unknownInventory: 698, booked: null, unsold: null, pct: 0,
  });
});

test("dated metrics distinguish zero sales from missing sales and fall back to project inventory", () => {
  assert.deepEqual(quarterlyInventoryStats([{ "Approved On": "2025-01-01", "Total Units": "120", "Units Booked (Q3_FY25-26)": "0" }], "Q3_FY25-26"), {
    inventory: 120, reportedInventory: 120, unknownInventory: 120, booked: 0, unsold: null, pct: 0,
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
    inventory: 1070, reportedInventory: 1070, unknownInventory: 0, booked: 698, unsold: 372, pct: 698 / 1070 * 100,
  });
  assert.equal(value(december, "Units Booked (Q4_FY25-26)"), 20);
  // A March zero is a report; missing March availability does not borrow December's.
  const march = { ...december, "Units Booked (Q4_FY25-26)": "0" };
  assert.deepEqual(quarterlyInventoryStats([march], "Q4_FY25-26"), {
    inventory: 150, reportedInventory: 150, unknownInventory: 150, booked: 0, unsold: null, pct: 0,
  });
});

test("dated Inventory and percentage denominator include unreported projects", () => {
  const december = { "Approved On": "2025-01-01", "Total Units": "150", "Units Booked (Q3_FY25-26)": "20", "Units Available (Q3_FY25-26)": "80" };
  const unpublished = { "Approved On": "2025-01-01", "Total Units": "250" };
  for (const suffix of ["Q3_FY25-26", "Q4_FY25-26"]) {
    assert.deepEqual(quarterlyInventoryStats([december, unpublished], suffix), {
      inventory: 350, reportedInventory: 100, unknownInventory: 250, booked: 20, unsold: 80, pct: 20 / 350 * 100,
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
      inventory: 100, reportedInventory: 100, unknownInventory: 0, booked: 20, unsold: 80, pct: 20,
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
test("sales-data-missing units are unknown, not unsold, and respect historical cutoffs", () => {
  const unpublished = { "Approved On": "2025-11-01", "Total Units": "200" };
  const later = { "Approved On": "2026-02-01", "Total Units": "300" };
  const all = inventoryStats([orchard, unpublished, later]);
  assert.equal(all.unknownInventory, 500);
  assert.equal(all.unsold, 133);
  assert.equal(all.booked, 837);
  assert.equal(quarterlyInventoryStats([orchard, unpublished, later], "Q3_FY25-26").unknownInventory, 898);
  assert.equal(quarterlyInventoryStats([orchard, unpublished, later], "Q4_FY25-26").unknownInventory, 500);
});

test("inventory shares use total inventory and displayed shares sum to 100%", () => {
  assert.deepEqual(inventoryShares({ inventory: 3, booked: 1, unsold: 1, unknownInventory: 1 }), {
    booked: 33.4, unsold: 33.3, unknownInventory: 33.3,
  });
  assert.deepEqual(inventoryShares({ inventory: 100, booked: 20, unsold: 50, unknownInventory: 30 }), {
    booked: 20, unsold: 50, unknownInventory: 30,
  });
  const totals = inventoryStats([orchard, { "Total Units": "200" }]);
  assert.equal(totals.booked + totals.unsold + totals.unknownInventory, totals.inventory);
  const percentages = inventoryShares(totals);
  assert.equal(Math.round(Object.values(percentages).reduce((a, b) => a + b, 0) * 10), 1000);
  assert.deepEqual(inventoryShares(inventoryStats([])), { booked: null, unsold: null, unknownInventory: null });
});

test("historical project counts include month-end approvals and exclude later or unknown dates", () => {
  const projects = [
    { "Approved On": "2025-12-31" },
    { "Approved On": "2026-01-01" },
    { "Approved On": "2026-03-31" },
    { "Approved On": "2026-04-01" },
    { "Approved On": "NA" },
  ];
  assert.equal(projectCountForPeriod(projects, "Q3_FY25-26"), 1);
  assert.equal(projectCountForPeriod(projects, "Q4_FY25-26"), 3);
});
