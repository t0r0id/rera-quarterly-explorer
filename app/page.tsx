"use client";

import { useEffect, useMemo, useState } from "react";

type Project = Record<string, string>;
type Sort = { key: string; direction: "asc" | "desc" };

const columns = [
  ["Project Name", "Project Name"], ["Approved On", "Approved On"], ["Proposed Completion Date", "Proposed Completion Date"],
  ["Total Units", "Total Units"], ["Units Booked (Q1_FY26-27)", "Booked · Q1 FY26–27"], ["bookedPercent", "Booked %"],
  ["Builder", "Builder"], ["Promoter Name", "Promoter Name"], ["District", "District"], ["Taluka", "Taluka"], ["Project Type", "Project Type"],
  ["Proposed Completion Date At Registration", "Proposed Completion Date At Registration"], ["Project Address", "Project Address"],
  ["Has Quarterly Update", "Has Quarterly Update"],
  ["Units Booked (Q3_FY25-26)", "Booked · Q3 FY25–26"], ["Units Booked (Q4_FY25-26)", "Booked · Q4 FY25–26"],
  ["Registration Number", "RERA ID"],
] as const;

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

function numeric(value: string | undefined) { const n = Number((value || "").replaceAll(",", "")); return Number.isFinite(n) ? n : null; }
function value(p: Project, key: string) { if (key === "bookedPercent") { const n = numeric(p["Units Booked (Q1_FY26-27)"]); const d = numeric(p["Total Units"]); return n !== null && d ? (n / d) * 100 : null; } return p[key] || null; }
function dateInRange(v: string, start: string, end: string) { return (!start || v >= start) && (!end || v <= end); }

function MultiSelect({ label, options, selected, setSelected, searchable = false }: { label: string; options: string[]; selected: string[]; setSelected: (v: string[]) => void; searchable?: boolean }) {
  const [query, setQuery] = useState(""); const shown = options.filter(v => v.toLowerCase().includes(query.toLowerCase()));
  const toggle = (v: string) => setSelected(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  return <fieldset className="filter"><legend>{label}<span>{selected.length ? selected.length : "All"}</span></legend>{searchable && <input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${label.toLowerCase()}`} />}
    <div className="choices">{shown.map(v => <label key={v}><input type="checkbox" checked={selected.includes(v)} onChange={() => toggle(v)} /><span>{v}</span></label>)}</div></fieldset>;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]); const [filtersOpen, setFiltersOpen] = useState(false);
  const [builders, setBuilders] = useState<string[]>([]), [promoters, setPromoters] = useState<string[]>([]), [talukas, setTalukas] = useState<string[]>([]), [types, setTypes] = useState<string[]>([]);
  const [completionStart, setCompletionStart] = useState(""), [completionEnd, setCompletionEnd] = useState(""), [approvalStart, setApprovalStart] = useState(""), [approvalEnd, setApprovalEnd] = useState(""), [hasUpdate, setHasUpdate] = useState(true), [sort, setSort] = useState<Sort>({ key: "Total Units", direction: "desc" });
  useEffect(() => { fetch("/projects.csv").then(r => r.text()).then(t => setProjects(parseCsv(t))); }, []);
  const options = (key: string) => [...new Set(projects.map(p => p[key]).filter(v => v && v !== "NA"))].sort((a, b) => a.localeCompare(b));
  const filtered = useMemo(() => projects.filter(p => (!builders.length || builders.includes(p.Builder)) && (!promoters.length || promoters.includes(p["Promoter Name"])) && (!talukas.length || talukas.includes(p.Taluka)) && (!types.length || types.includes(p["Project Type"])) && (!hasUpdate || p["Has Quarterly Update"] === "Yes") && dateInRange(p["Proposed Completion Date"] || "", completionStart, completionEnd) && dateInRange(p["Approved On"] || "", approvalStart, approvalEnd)).sort((a,b) => { const av = value(a, sort.key), bv = value(b, sort.key); const an = typeof av === "number" ? av : numeric(av as string); const bn = typeof bv === "number" ? bv : numeric(bv as string); const c = an !== null && bn !== null ? an - bn : String(av ?? "").localeCompare(String(bv ?? "")); return sort.direction === "asc" ? c : -c; }), [projects, builders, promoters, talukas, types, completionStart, completionEnd, approvalStart, approvalEnd, hasUpdate, sort]);
  const stats = useMemo(() => { const total = filtered.reduce((s,p) => s + (numeric(p["Total Units"]) || 0), 0); const booked = filtered.reduce((s,p) => s + (numeric(p["Units Booked (Q1_FY26-27)"]) || 0), 0); return { total, booked, pct: total ? booked / total * 100 : 0 }; }, [filtered]);
  const clear = () => { setBuilders([]); setPromoters([]); setTalukas([]); setTypes([]); setCompletionStart(""); setCompletionEnd(""); setApprovalStart(""); setApprovalEnd(""); setHasUpdate(true); };
  const sortBy = (key: string) => setSort(s => ({ key, direction: s.key === key && s.direction === "asc" ? "desc" : "asc" }));
  return <main>
    <header className="topbar"><div><p className="eyebrow">Bengaluru Urban · Karnataka RERA</p><h1>BLR Real Estate Sales Analysis</h1></div><button className="filter-toggle" onClick={() => setFiltersOpen(v => !v)}>{filtersOpen ? "Close filters" : "Filters"}<b>{builders.length + promoters.length + talukas.length + types.length + Number(hasUpdate)}</b></button></header>
    <section className="metrics" aria-label="Cumulative figures"><Metric label="Projects" value={filtered.length.toLocaleString("en-IN")} /><Metric label="Inventory" value={stats.total.toLocaleString("en-IN")} /><Metric label="Booked · Q1 FY26–27" value={stats.booked.toLocaleString("en-IN")} /><Metric label="Booked" value={`${stats.pct.toFixed(1)}%`} /></section>
    <div className="workspace"><aside className={filtersOpen ? "sidebar open" : "sidebar"}><div className="filter-head"><h2>Refine the view</h2><button onClick={clear}>Reset</button></div><fieldset className="filter"><legend>Approved on date</legend><div className="dates"><input type="date" value={approvalStart} onChange={e => setApprovalStart(e.target.value)} /><input type="date" value={approvalEnd} onChange={e => setApprovalEnd(e.target.value)} /></div></fieldset><fieldset className="filter"><legend>Completion on date</legend><div className="dates"><input type="date" value={completionStart} onChange={e => setCompletionStart(e.target.value)} /><input type="date" value={completionEnd} onChange={e => setCompletionEnd(e.target.value)} /></div></fieldset><MultiSelect label="Taluk" options={options("Taluka")} selected={talukas} setSelected={setTalukas} /><MultiSelect label="Builder" options={options("Builder")} selected={builders} setSelected={setBuilders} searchable /><MultiSelect label="Promoter" options={options("Promoter Name")} selected={promoters} setSelected={setPromoters} searchable /><MultiSelect label="Project type" options={options("Project Type")} selected={types} setSelected={setTypes} />
      <label className="switch"><input type="checkbox" checked={hasUpdate} onChange={e => setHasUpdate(e.target.checked)} /><span>Has latest quarterly update</span></label></aside>
      <section className="table-panel"><div className="table-meta"><span>{filtered.length.toLocaleString("en-IN")} matching projects</span><span>Click any heading to sort</span></div><div className="table-wrap"><table><thead><tr>{columns.map(([key,label]) => <th key={key}><button onClick={() => sortBy(key)}>{label}<i className={sort.key === key ? "active" : ""}>{sort.key === key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</i></button></th>)}</tr></thead><tbody>{filtered.map(p => <tr key={p["Registration Number"]}>{columns.map(([key]) => { const v = value(p,key); return <td key={key} title={String(v ?? "—")}>{key === "Has Quarterly Update" ? <span className={v === "Yes" ? "tag yes" : "tag"}>{v === "Yes" ? "Yes" : "No"}</span> : key === "bookedPercent" ? v === null ? "—" : <span className="fill" style={{ "--fill": `${Math.min(100, v as number)}%` } as React.CSSProperties}><b>{(v as number).toFixed(1)}%</b></span> : v || "—"}</td>; })}</tr>)}</tbody></table>{!projects.length && <p className="loading">Loading RERA project data…</p>}{projects.length > 0 && !filtered.length && <p className="loading">No projects match these filters.</p>}</div></section></div>
    <footer>Creator <a href="https://github.com/t0r0id" target="_blank" rel="noreferrer">GitHub</a><span>·</span><a href="https://www.linkedin.com/in/shahbhoumik/" target="_blank" rel="noreferrer">LinkedIn</a></footer>
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }
