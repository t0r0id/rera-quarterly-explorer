export type Project = Record<string, string>;

const quarters = [
  ["Q1_FY26-27", "Q1 FY26–27"],
  ["Q4_FY25-26", "Q4 FY25–26"],
  ["Q3_FY25-26", "Q3 FY25–26"],
] as const;

export const reportingPeriods = [
  { suffix: "Q3_FY25-26", label: "Dec 2025", endDate: "2025-12-31" },
  { suffix: "Q4_FY25-26", label: "Mar 2026", endDate: "2026-03-31" },
  { suffix: "Q1_FY26-27", label: "Jun 2026", endDate: "2026-06-30" },
] as const;

export type ReportingPeriod = typeof reportingPeriods[number]["suffix"];

function approvedBy(project: Project, endDate: string) {
  const approvedOn = project["Approved On"];
  return /^\d{4}-\d{2}-\d{2}$/.test(approvedOn ?? "") && approvedOn <= endDate;
}

export function projectCountForPeriod(projects: Project[], suffix: ReportingPeriod) {
  const endDate = reportingPeriods.find(period => period.suffix === suffix)!.endDate;
  return projects.filter(project => approvedBy(project, endDate)).length;
}

export function numeric(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const number = Number(value.replaceAll(",", "").trim());
  return Number.isFinite(number) ? number : null;
}

export function latestBooking(project: Project) {
  for (const [index, [suffix, quarter]] of quarters.entries()) {
    const booked = numeric(project[`Units Booked (${suffix})`]);
    if (booked !== null) {
      return {
        booked,
        available: numeric(project[`Units Available (${suffix})`]),
        quarter,
        fallback: index > 0,
      };
    }
  }
  return null;
}

export function bookingForPeriod(project: Project, suffix: ReportingPeriod) {
  const candidates = suffix === "Q4_FY25-26" ? ["Q4_FY25-26", "Q3_FY25-26"] : [suffix];
  for (const candidate of candidates) {
    const booked = numeric(project[`Units Booked (${candidate})`]);
    if (booked !== null) return {
      booked,
      available: numeric(project[`Units Available (${candidate})`]),
      quarter: reportingPeriods.find(period => period.suffix === candidate)!.label,
      fallback: candidate !== suffix,
    };
  }
  return null;
}

export function totalUnits(project: Project): number | null {
  const booking = latestBooking(project);
  return booking && booking.available !== null
    ? booking.booked + booking.available
    : numeric(project["Total Units"]);
}

export function value(project: Project, key: string): string | number | null {
  if (key === "Total Units") return totalUnits(project);
  if (key === "Units Booked (Q1_FY26-27)") return latestBooking(project)?.booked ?? null;
  if (key === "Units Booked (Q4_FY25-26)") return bookingForPeriod(project, "Q4_FY25-26")?.booked ?? null;
  if (key === "Units Available (Q1_FY26-27)") return latestBooking(project)?.available ?? null;
  if (key === "Units Available (Q4_FY25-26)") return bookingForPeriod(project, "Q4_FY25-26")?.available ?? null;
  if (key === "Units Available (Q3_FY25-26)") return numeric(project[key]);
  if (key === "bookedPercent") {
    const booking = latestBooking(project);
    const units = totalUnits(project);
    return booking && units !== null && units > 0 ? booking.booked / units * 100 : null;
  }
  return project[key] || null;
}

export function inventoryStats(projects: Project[]) {
  let inventory = 0;
  let reportedInventory = 0;
  let booked = 0;
  let unsold = 0;
  let availableCount = 0;
  for (const project of projects) {
    const units = totalUnits(project) ?? 0;
    const booking = latestBooking(project);
    inventory += units;
    if (booking) {
      reportedInventory += units;
      booked += booking.booked;
      if (booking.available !== null) {
        unsold += booking.available;
        availableCount++;
      }
    }
  }
  return { inventory, reportedInventory, unknownInventory: inventory - booked - unsold, booked, unsold: availableCount ? unsold : null, pct: inventory ? booked / inventory * 100 : 0 };
}

// March carries December reports forward when March bookings are missing.
export function quarterlyInventoryStats(projects: Project[], suffix: ReportingPeriod) {
  const endDate = reportingPeriods.find(period => period.suffix === suffix)!.endDate;
  let inventory = 0;
  let reportedInventory = 0;
  let booked = 0;
  let publishedCount = 0;
  let unsold = 0;
  let availableCount = 0;
  for (const project of projects) {
    // Unknown dates cannot establish that a project existed by this period end.
    if (!approvedBy(project, endDate)) continue;
    const report = bookingForPeriod(project, suffix);
    if (!report) {
      inventory += numeric(project["Total Units"]) ?? 0;
      continue;
    }
    const periodBooked = report.booked;
    const available = report.available;
    const units = available !== null
      ? periodBooked + available
      : numeric(project["Total Units"]) ?? 0;
    inventory += units;
    publishedCount++;
    reportedInventory += units;
    booked += periodBooked;
    if (available !== null) {
      unsold += available;
      availableCount++;
    }
  }
  return {
    inventory,
    reportedInventory,
    unknownInventory: inventory - booked - unsold,
    booked: publishedCount ? booked : null,
    unsold: availableCount ? unsold : null,
    pct: inventory > 0 ? booked / inventory * 100 : null,
  };
}

// Allocate the final decimal so displayed category shares sum to exactly 100%.
export function inventoryShares(stats: { inventory: number; booked: number | null; unsold: number | null; unknownInventory: number }) {
  if (stats.inventory <= 0) return { booked: null, unsold: null, unknownInventory: null };
  const keys = ["booked", "unsold", "unknownInventory"] as const;
  const parts = keys.map(key => {
    const raw = (stats[key] ?? 0) / stats.inventory * 1000;
    return { key, tenths: Math.floor(raw), remainder: raw - Math.floor(raw) };
  });
  let remaining = 1000 - parts.reduce((sum, part) => sum + part.tenths, 0);
  for (const part of [...parts].sort((a, b) => b.remainder - a.remainder)) {
    if (remaining-- > 0) part.tenths++;
  }
  return Object.fromEntries(parts.map(part => [part.key, part.tenths / 10])) as Record<typeof keys[number], number | null>;
}
