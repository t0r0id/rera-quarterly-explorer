"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";

import { latestBooking, projectCoordinates, reportingPeriods, totalUnits, type Project } from "../lib/project-metrics";

// latestBooking names quarters "Q2 FY26–27"; show the same month labels as the table ("Sep 2026").
const periodLabel = Object.fromEntries(reportingPeriods.map(p => [p.suffix.replace("_", " ").replace("-", "–"), p.label]));

const BENGALURU_CENTER: L.LatLngTuple = [12.97, 77.59];
const NO_DATA_COLOR = "#9aa39c";
// Unsold red → amber → sold green, matching the metric cards.
const STOPS: [number, [number, number, number]][] = [[0, [179, 38, 30]], [50, [224, 165, 38]], [100, [21, 88, 68]]];

export function bookedColor(percent: number | null) {
  if (percent === null) return NO_DATA_COLOR;
  const p = Math.max(0, Math.min(100, percent));
  const upper = STOPS.findIndex(([stop]) => p <= stop);
  const [s0, c0] = STOPS[Math.max(0, upper - 1)];
  const [s1, c1] = STOPS[upper];
  const t = s1 === s0 ? 0 : (p - s0) / (s1 - s0);
  return `rgb(${c0.map((c, i) => Math.round(c + (c1[i] - c) * t)).join(",")})`;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const format = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-IN"));

type MapPoint = { project: Project; lat: number; lng: number; units: number | null; booked: number | null; available: number | null; percent: number | null; quarter: string | null; fallback: boolean };
type PointMarker = L.CircleMarker & { point: MapPoint };

function toPoint(project: Project): MapPoint | null {
  const coords = projectCoordinates(project);
  if (!coords) return null;
  const booking = latestBooking(project);
  const units = totalUnits(project);
  return {
    project, ...coords, units,
    booked: booking?.booked ?? null,
    available: booking?.available ?? null,
    percent: booking && units ? booking.booked / units * 100 : null,
    quarter: booking ? periodLabel[booking.quarter] ?? booking.quarter : null,
    fallback: booking?.fallback ?? false,
  };
}

function popupHtml({ project: p, units, booked, available, percent, quarter, fallback }: MapPoint) {
  const field = (label: string, value: string) => `<dt>${label}</dt><dd>${value}</dd>`;
  const gmaps = `https://www.google.com/maps?q=${encodeURIComponent(`${p.Latitude},${p.Longitude}`)}`;
  return `<div class="map-popup"><strong>${escapeHtml(p["Project Name"] || "—")}</strong><span>${escapeHtml(p.Builder || "")}</span><dl>
    ${field("Location", escapeHtml([p.Taluka, p.District].filter(Boolean).join(", ")))}
    ${field("Total units", format(units))}
    ${quarter
      ? field(`Booked · ${escapeHtml(quarter)}${fallback ? "*" : ""}`, `${format(booked)}${percent !== null ? ` (${percent.toFixed(1)}%)` : ""}`) + field("Unsold", format(available))
      : field("Sales", "Not published")}
    ${field("Approved", escapeHtml(p["Approved On"] || "—"))}
    ${field("Completion", escapeHtml(p["Proposed Completion Date"] || "—"))}
    ${field("RERA ID", `<code>${escapeHtml(p["Registration Number"])}</code>`)}
  </dl>${fallback ? `<small>* Sep 2026 not reported; latest earlier report shown.</small>` : ""}<a href="${gmaps}" target="_blank" rel="noreferrer">Open in Google Maps ↗</a></div>`;
}

function radius(units: number | null) {
  return units ? Math.max(5, Math.min(20, 3 + Math.sqrt(units) / 2.2)) : 5;
}

function clusterIcon(cluster: L.MarkerCluster) {
  let booked = 0, units = 0;
  for (const marker of cluster.getAllChildMarkers() as unknown as PointMarker[]) {
    const { point } = marker;
    if (point.booked !== null && point.units) { booked += point.booked; units += point.units; }
  }
  const count = cluster.getChildCount();
  const size = count < 10 ? 32 : count < 100 ? 40 : count < 1000 ? 48 : 56;
  const color = bookedColor(units ? booked / units * 100 : null);
  return L.divIcon({
    html: `<span style="background:${color}">${count}</span>`,
    className: "map-cluster",
    iconSize: [size, size],
  });
}

export default function ProjectMap({ projects }: { projects: Project[] }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.MarkerClusterGroup | null>(null);
  const points = useMemo(() => projects.map(toPoint).filter((p): p is MapPoint => p !== null), [projects]);

  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { preferCanvas: true, zoomControl: true }).setView(BENGALURU_CENTER, 10);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(instance);
    layer.current = L.markerClusterGroup({ chunkedLoading: true, showCoverageOnHover: false, maxClusterRadius: 45, spiderfyOnMaxZoom: true, iconCreateFunction: clusterIcon }).addTo(instance);
    map.current = instance;
    return () => { instance.remove(); map.current = null; layer.current = null; };
  }, []);

  useEffect(() => {
    const group = layer.current, instance = map.current;
    if (!group || !instance) return;
    group.clearLayers();
    const markers = points.map(point => {
      const color = bookedColor(point.percent);
      const marker = L.circleMarker([point.lat, point.lng], { radius: radius(point.units), color: "#fff", weight: 1, fillColor: color, fillOpacity: 0.85 }) as PointMarker;
      marker.point = point;
      marker.bindPopup(() => popupHtml(point), { maxWidth: 300 });
      marker.bindTooltip(escapeHtml(point.project["Project Name"] || ""), { direction: "top", offset: [0, -4] });
      return marker;
    });
    group.addLayers(markers);
    if (markers.length) instance.fitBounds(L.latLngBounds(markers.map(m => m.getLatLng())), { padding: [24, 24], maxZoom: 15 });
  }, [points]);

  return <div className="map-wrap">
    <div ref={container} className="map-canvas" role="region" aria-label="Map of filtered projects" />
    <div className="map-legend" aria-label="Map legend">
      <span>Booked % · latest report</span>
      <div className="map-legend-scale" style={{ background: `linear-gradient(90deg, ${bookedColor(0)}, ${bookedColor(50)}, ${bookedColor(100)})` }} />
      <div className="map-legend-ticks"><span>0%</span><span>50%</span><span>100%</span></div>
      <div className="map-legend-row map-legend-extra"><i style={{ background: NO_DATA_COLOR }} /> Sales not published</div>
      <div className="map-legend-row map-legend-extra"><i className="map-legend-size" /> Size = total units</div>
      <p className="map-coverage">{points.length.toLocaleString("en-IN")} of {projects.length.toLocaleString("en-IN")} filtered projects have a usable location</p>
    </div>
  </div>;
}
