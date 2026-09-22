export type Project = Record<string, string>;

const quarters = [
  ["Q1_FY26-27", "Q1 FY26–27"],
  ["Q4_FY25-26", "Q4 FY25–26"],
  ["Q3_FY25-26", "Q3 FY25–26"],
] as const;

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

export function totalUnits(project: Project): number | null {
  const booking = latestBooking(project);
  return booking && booking.available !== null
    ? booking.booked + booking.available
    : numeric(project["Total Units"]);
}

export function value(project: Project, key: string): string | number | null {
  if (key === "Total Units") return totalUnits(project);
  if (key === "Units Booked (Q1_FY26-27)") return latestBooking(project)?.booked ?? null;
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
  for (const project of projects) {
    const units = totalUnits(project) ?? 0;
    const booking = latestBooking(project);
    inventory += units;
    if (booking) {
      reportedInventory += units;
      booked += booking.booked;
    }
  }
  return { inventory, reportedInventory, booked, pct: reportedInventory ? booked / reportedInventory * 100 : 0 };
}
