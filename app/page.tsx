"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { bookingForPeriod, inventoryShares, inventoryStats, latestBooking, numeric, projectCountForPeriod, quarterlyInventoryStats, reportingPeriods, totalUnits, value, type Project } from "../lib/project-metrics";
type Sort = { key: string; direction: "asc" | "desc" };
type Column = readonly [string, string];

const columns: Column[] = [
  ["Project Name", "Project Name"], ["Approved On", "Approved On"], ["Proposed Completion Date", "Proposed Completion Date"],
  ["Total Units", "Total Units"], ["Units Booked (Q1_FY26-27)", "Booked · Jun 2026"], ["bookedPercent", "Booked %"],
  ["Builder", "Builder"], ["Promoter Name", "Promoter Name"], ["District", "District"], ["Taluka", "Taluka"], ["Project Type", "Project Type"],
  ["Proposed Completion Date At Registration", "Proposed Completion Date At Registration"], ["Project Address", "Project Address"],
  ["Has Quarterly Update", "Has Quarterly Update"],
  ["Units Booked (Q3_FY25-26)", "Booked · Dec 2025"], ["Units Booked (Q4_FY25-26)", "Booked · Mar 2026"],
  ["Registration Number", "RERA ID"],
] as const;
const PAGE_SIZE = 100;
const DEFAULT_APPROVAL_START = "2025-01-01";

function parseCsv(text: string): Project[] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quote = false;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (quote && c === '"' && text[i + 1] === '"') { field += c; i++; }
    else if (c === '"') quote = !quote;
    else if (c === "," && !quote) { row.push(field); field = ""; }
    else if ((c === "\n" || c === "\r") && !quote) { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); if (row.length > 1) rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [headers, ...body] = rows;
  return body.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]))).filter(p => p["Registration Number"]);
}

function dateInRange(v: string, start: string, end: string) { return (!start || v >= start) && (!end || v <= end); }
function googleMapsUrl(p: Project) { const lat = numeric(p.Latitude); const lng = numeric(p.Longitude); return lat !== null && lng !== null ? `https://www.google.com/maps?q=${lat},${lng}` : null; }

const OPTION_HEIGHT = 36;
const OPTION_VIEWPORT = 144;
const MultiSelect = memo(function MultiSelect({ label, options, selected, setSelected, searchable = false }: { label: string; options: string[]; selected: string[]; setSelected: (v: string[]) => void; searchable?: boolean }) {
  const [query, setQuery] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => options.filter(v => v.toLowerCase().includes(query.toLowerCase())), [options, query]);
  const first = Math.max(0, Math.floor(scrollTop / OPTION_HEIGHT) - 2);
  const end = Math.min(shown.length, first + 10);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const toggle = (v: string) => setSelected(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  return <fieldset className="filter"><legend>{label}<span>{selected.length ? selected.length : "All"}</span></legend>{searchable && <input aria-label={`Search ${label.toLowerCase()}`} value={query} onChange={e => { setQuery(e.target.value); setScrollTop(0); if (listRef.current) listRef.current.scrollTop = 0; }} placeholder={`Search ${label.toLowerCase()}`} />}
    <div className="choices" ref={listRef} style={{ height: Math.min(OPTION_VIEWPORT, Math.max(OPTION_HEIGHT, shown.length * OPTION_HEIGHT)) }} onScroll={event => setScrollTop(event.currentTarget.scrollTop)}>
      <div style={{ height: shown.length * OPTION_HEIGHT, position: "relative" }}>
        {shown.slice(first, end).map((v, offset) => <label key={v} title={v} style={{ position: "absolute", top: (first + offset) * OPTION_HEIGHT, height: OPTION_HEIGHT, left: 0, right: 0 }}><input type="checkbox" checked={selectedSet.has(v)} onChange={() => toggle(v)} onKeyDown={event => {
          const index = first + offset;
          const next = event.key === "ArrowDown" ? index + 1 : event.key === "ArrowUp" ? index - 1 : null;
          if (next === null || next < 0 || next >= shown.length) return;
          event.preventDefault();
          listRef.current?.scrollTo({ top: next * OPTION_HEIGHT });
          setScrollTop(next * OPTION_HEIGHT);
          requestAnimationFrame(() => listRef.current?.querySelector<HTMLInputElement>(`input[data-index="${next}"]`)?.focus({ preventScroll: true }));
        }} data-index={first + offset} /><span>{v}</span></label>)}
      </div>
      {!shown.length && <p className="no-options">No matches</p>}
    </div></fieldset>;
});

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]); const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnOrder, setColumnOrder] = useState<Column[]>(() => [...columns]); const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [projectNames, setProjectNames] = useState<string[]>([]);
  const selectProjects = useCallback((names: string[]) => { setProjectNames(names); setPage(0); }, []);
  const [builders, setBuilders] = useState<string[]>([]), [promoters, setPromoters] = useState<string[]>([]), [talukas, setTalukas] = useState<string[]>([]), [types, setTypes] = useState<string[]>([]);
  const [completionStart, setCompletionStart] = useState(""), [completionEnd, setCompletionEnd] = useState(""), [approvalStart, setApprovalStart] = useState(DEFAULT_APPROVAL_START), [approvalEnd, setApprovalEnd] = useState(""), [minimumUnits, setMinimumUnits] = useState(""), [maximumUnits, setMaximumUnits] = useState(""), [hasUpdate, setHasUpdate] = useState(false), [sort, setSort] = useState<Sort>({ key: "Total Units", direction: "desc" });
  useEffect(() => { fetch("/projects.csv").then(r => r.text()).then(t => setProjects(parseCsv(t))); }, []);
  const filterOptions = useMemo(() => Object.fromEntries(["Project Name", "Taluka", "Builder", "Promoter Name", "Project Type"].map(key => [key, [...new Set(projects.map(p => p[key]).filter(v => v && v !== "NA"))].sort((a, b) => a.localeCompare(b))])), [projects]);
  const options = (key: string) => filterOptions[key];
  const unitsBounds = useMemo(() => { const units = projects.map(p => totalUnits(p)).filter((n): n is number => n !== null); return units.length ? [Math.min(...units), Math.max(...units)] as [number, number] : null; }, [projects]);
  const filtered = useMemo(() => projects.filter(p => { const units = totalUnits(p); return (!projectNames.length || projectNames.includes(p["Project Name"])) && (!builders.length || builders.includes(p.Builder)) && (!promoters.length || promoters.includes(p["Promoter Name"])) && (!talukas.length || talukas.includes(p.Taluka)) && (!types.length || types.includes(p["Project Type"])) && (!hasUpdate || p["Has Quarterly Update"] === "Yes") && (!minimumUnits || (units !== null && units >= Number(minimumUnits))) && (!maximumUnits || (units !== null && units <= Number(maximumUnits))) && dateInRange(p["Proposed Completion Date"] || "", completionStart, completionEnd) && dateInRange(p["Approved On"] || "", approvalStart, approvalEnd); }).sort((a,b) => { const av = value(a, sort.key), bv = value(b, sort.key); const missingA = av === null || av === "NA" || av === ""; const missingB = bv === null || bv === "NA" || bv === ""; if (missingA || missingB) return missingA === missingB ? 0 : missingA ? 1 : -1; const an = typeof av === "number" ? av : numeric(av as string); const bn = typeof bv === "number" ? bv : numeric(bv as string); const c = an !== null && bn !== null ? an - bn : String(av).localeCompare(String(bv)); return sort.direction === "asc" ? c : -c; }), [projects, projectNames, builders, promoters, talukas, types, completionStart, completionEnd, approvalStart, approvalEnd, minimumUnits, maximumUnits, hasUpdate, sort]);
  const stats = useMemo(() => inventoryStats(filtered), [filtered]);
  const datedStats = useMemo(() => reportingPeriods.filter(period => period.suffix !== "Q1_FY26-27").map(period => ({
    label: period.label,
    projects: projectCountForPeriod(filtered, period.suffix),
    ...quarterlyInventoryStats(filtered, period.suffix),
  })), [filtered]);
  const shares = inventoryShares(stats);
  const history = (key: "projects" | "inventory" | "unknownInventory" | "booked" | "unsold") => datedStats.map(period => {
    const percentage = key === "inventory" || key === "projects" ? null : inventoryShares(period)[key];
    return { label: period.label, value: (period[key] ?? 0).toLocaleString("en-IN"), percentage };
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)); const currentPage = Math.min(page, pageCount - 1); const visibleProjects = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const clear = () => { setProjectNames([]); setBuilders([]); setPromoters([]); setTalukas([]); setTypes([]); setCompletionStart(""); setCompletionEnd(""); setApprovalStart(DEFAULT_APPROVAL_START); setApprovalEnd(""); setMinimumUnits(""); setMaximumUnits(""); setHasUpdate(false); setPage(0); };
  const sortBy = (key: string) => { setSort(s => ({ key, direction: s.key === key && s.direction === "asc" ? "desc" : "asc" })); setPage(0); };
  const moveColumn = (target: string) => { if (!draggedColumn || draggedColumn === target) return; setColumnOrder(current => { const from = current.findIndex(([key]) => key === draggedColumn); const to = current.findIndex(([key]) => key === target); const next = [...current]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); return next; }); setDraggedColumn(null); };
  return <main>
    <header className="topbar"><div><p className="eyebrow">Bengaluru Urban · Karnataka RERA</p><h1>BLR Real Estate Sales Analysis</h1></div><button className="filter-toggle" onClick={() => setFiltersOpen(v => !v)}>{filtersOpen ? "Close filters" : "Filters"}<b>{projectNames.length + builders.length + promoters.length + talukas.length + types.length + Number(hasUpdate)}</b></button></header>
    <section className="metrics" aria-label="Cumulative figures"><Metric label="Projects" value={filtered.length.toLocaleString("en-IN")} history={history("projects")} /><Metric label="Inventory" value={stats.inventory.toLocaleString("en-IN")} history={history("inventory")} /><Metric status="unknown" label="Sales data not published" value={stats.unknownInventory.toLocaleString("en-IN")} history={history("unknownInventory")} percentage={shares.unknownInventory} description="Units · sales status unknown" /><Metric status="booked" label="Sold" value={stats.booked.toLocaleString("en-IN")} history={history("booked")} percentage={shares.booked} /><Metric status="unsold" label="Unsold inventory (available)" value={(stats.unsold ?? 0).toLocaleString("en-IN")} history={history("unsold")} percentage={shares.unsold} /></section>
    <p className="metric-note">Dated figures include only filtered projects approved by that month-end (31 Dec 2025 or 31 Mar 2026). Inventory includes projects without sales reports, using project-details units when report data is missing. Unknown counts inventory without a reported booked or available status. Sold and Unsold include published figures only. Percentages use total inventory: Sold + Unsold + Unknown = 100%. Mar 2026 falls back to Dec 2025 when March is missing. Unsold sums reported available units only. * Jun 2026 is the target sales reporting period; missing June reports fall back to earlier data. Headline project and inventory totals include all filtered approvals.</p>
    <div className="workspace"><aside className={filtersOpen ? "sidebar open" : "sidebar"}><div className="filter-head"><h2>Refine the view</h2><button onClick={clear}>Reset</button></div><fieldset className="filter"><legend>Approved on date</legend><div className="dates"><input type="date" value={approvalStart} onChange={e => setApprovalStart(e.target.value)} /><input type="date" value={approvalEnd} onChange={e => setApprovalEnd(e.target.value)} /></div></fieldset><fieldset className="filter"><legend>Completion on date</legend><div className="dates"><input type="date" value={completionStart} onChange={e => setCompletionStart(e.target.value)} /><input type="date" value={completionEnd} onChange={e => setCompletionEnd(e.target.value)} /></div></fieldset><fieldset className="filter"><legend>Total units{unitsBounds && <span>{unitsBounds[0].toLocaleString("en-IN")} – {unitsBounds[1].toLocaleString("en-IN")}</span>}</legend><div className="unit-fields"><input aria-label="Minimum total units" type="number" min="0" value={minimumUnits} onChange={e => setMinimumUnits(e.target.value)} placeholder="Minimum" /><input aria-label="Maximum total units" type="number" min="0" value={maximumUnits} onChange={e => setMaximumUnits(e.target.value)} placeholder="Maximum" /></div></fieldset><MultiSelect label="Taluk" options={options("Taluka")} selected={talukas} setSelected={setTalukas} /><MultiSelect label="Builder" options={options("Builder")} selected={builders} setSelected={setBuilders} searchable /><MultiSelect label="Promoter" options={options("Promoter Name")} selected={promoters} setSelected={setPromoters} searchable /><MultiSelect label="Project Name" options={options("Project Name")} selected={projectNames} setSelected={selectProjects} searchable /><MultiSelect label="Project type" options={options("Project Type")} selected={types} setSelected={setTypes} />
      <label className="switch"><input type="checkbox" checked={hasUpdate} onChange={e => setHasUpdate(e.target.checked)} /><span>Has latest quarterly update</span></label></aside>
      <section className="table-panel"><div className="table-meta"><span>{filtered.length ? `${(currentPage * PAGE_SIZE + 1).toLocaleString("en-IN")}–${Math.min((currentPage + 1) * PAGE_SIZE, filtered.length).toLocaleString("en-IN")} of ${filtered.length.toLocaleString("en-IN")} projects` : "0 matching projects"}</span><span>Drag headings to reorder · Click to sort · <b>*</b> Earlier report used where the labelled period is missing</span></div><div className="table-wrap"><table><thead><tr>{columnOrder.map(([key,label]) => <th key={key} draggable onDragStart={() => setDraggedColumn(key)} onDragOver={event => event.preventDefault()} onDrop={() => moveColumn(key)} onDragEnd={() => setDraggedColumn(null)} className={draggedColumn === key ? "dragging" : ""}><button onClick={() => sortBy(key)}><span className="drag-handle" aria-hidden="true">⠿</span>{label}<i className={sort.key === key ? "active" : ""}>{sort.key === key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</i></button></th>)}</tr></thead><tbody>{visibleProjects.map(p => <ProjectRow key={p["Registration Number"]} project={p} columnOrder={columnOrder} />)}</tbody></table>{!projects.length && <p className="loading">Loading RERA project data…</p>}{projects.length > 0 && !filtered.length && <p className="loading">No projects match these filters.</p>}</div>{filtered.length > PAGE_SIZE && <nav className="pagination" aria-label="Project table pages"><button onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0}>Previous</button><span>Page {currentPage + 1} of {pageCount}</span><button onClick={() => setPage(currentPage + 1)} disabled={currentPage === pageCount - 1}>Next</button></nav>}</section></div>
    <footer>Creator <a href="https://github.com/t0r0id" target="_blank" rel="noreferrer">GitHub</a><span>·</span><a href="https://www.linkedin.com/in/shahbhoumik/" target="_blank" rel="noreferrer">LinkedIn</a></footer>
  </main>;
}

const ProjectRow = memo(function ProjectRow({ project: p, columnOrder }: { project: Project; columnOrder: Column[] }) {
  const booking = latestBooking(p);
  const mapUrl = googleMapsUrl(p);
  return <tr>{columnOrder.map(([key]) => {
    const v = value(p, key);
    const cellBooking = key === "Units Booked (Q4_FY25-26)" ? bookingForPeriod(p, "Q4_FY25-26") : booking;
    const hasFallback = (key === "Units Booked (Q1_FY26-27)" || key === "Units Booked (Q4_FY25-26)" || key === "bookedPercent") && cellBooking?.fallback;
    const title = key === "Total Units"
      ? booking && booking.available !== null
        ? `${booking.quarter}: ${booking.booked} booked + ${booking.available} available = ${v} units`
        : "Project-details inventory; a complete quarterly booked/available pair is unavailable"
      : hasFallback ? `${cellBooking?.quarter} used because ${key === "Units Booked (Q4_FY25-26)" ? "Mar" : "Jun"} 2026 is unavailable` : String(v ?? "—");
    return <td key={key} title={title}>{
      key === "Project Name" ? <>{v ?? "—"}{mapUrl && <a className="map-link" href={mapUrl} target="_blank" rel="noreferrer">Map ↗</a>}</> :
      key === "Has Quarterly Update" ? <span className={v === "Yes" ? "tag yes" : "tag"}>{v === "Yes" ? "Yes" : "No"}</span> :
      key === "bookedPercent" ? v === null ? "—" : <span className="fill" style={{ "--fill": `${Math.min(100, v as number)}%` } as React.CSSProperties}><b>{(v as number).toFixed(1)}%{hasFallback && <sup>*</sup>}</b></span> :
      (key === "Units Booked (Q1_FY26-27)" || key === "Units Booked (Q4_FY25-26)") ? <>{v ?? "—"}{hasFallback && <sup>*</sup>}</> : v ?? "—"
    }</td>;
  })}</tr>;
});

function Metric({ label, value, history, description, percentage, status }: { label: string; value: string; history?: { label: string; value: string; percentage?: number | null }[]; description?: string; percentage?: number | null; status?: "unknown" | "booked" | "unsold" }) {
  return <div className={status ? `metric metric--${status}` : "metric"}><span>{label}</span><span className="metric-period">Jun 2026*</span><strong>{value}{percentage !== undefined && <small className="metric-percentage">({percentage === null ? "—" : `${percentage.toFixed(1)}%`})</small>}</strong><small className="metric-description" aria-hidden={!description}>{description || "\u00a0"}</small>
    {history && <dl className="metric-history">{history.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}{row.percentage !== undefined && row.percentage !== null && <small> ({row.percentage.toFixed(1)}%)</small>}</dd></div>)}</dl>}
  </div>;
}
