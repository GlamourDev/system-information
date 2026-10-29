import { renderIcon } from "../components/icons.js";
import type { Systeminformation as SI } from "systeminformation";
import type { MonitorView, TableRow } from "../model/types.js";
import { escapeHtml } from "../lib/dom.js";
import { formatBytes, formatNumber, formatSensor, isFiniteNumber } from "../lib/format.js";
import { renderCapacityBar, renderHeading, renderSection } from "../components/table.js";

function renderVolume(volume: SI.FsSizeData): string {
  const usedPercent = (volume.used / volume.size) * 100;
  const available = isFiniteNumber(volume.available) ? volume.available : volume.size - volume.used;

  return `
    <div class="volume">
      <div class="volume__header">
        <strong class="volume__name">${escapeHtml(volume.mount || volume.fs)}</strong>
        <span class="volume__capacity">${formatBytes(volume.used)} / ${formatBytes(volume.size)}</span>
      </div>
      ${renderCapacityBar(usedPercent)}
      <div class="volume__footer">
        <span>${escapeHtml(volume.type || volume.fs)}</span>
        <span>${formatNumber(usedPercent)} % · ${formatBytes(available)} available</span>
      </div>
    </div>
  `;
}

function renderDrive(
  drive: NonNullable<MonitorView["hardware"]["diskLayout"]>[number],
  index: number,
): string {
  const rows: TableRow[] = [
    ["Device", drive.device],
    ["Type", drive.type],
    ["Interface", drive.interfaceType],
    ["Capacity", formatBytes(drive.size)],
    ["Vendor", drive.vendor],
    ["Firmware", drive.firmwareRevision],
    ["S.M.A.R.T. status", drive.smartStatus],
  ];

  const health = drive.health;
  const metrics: TableRow[] = (health?.metrics ?? []).map((metric) => [metric.label,
    metric.unit === "bytes" ? formatBytes(metric.value) : `${formatNumber(metric.value)}${metric.unit ? ` ${metric.unit}` : ""}`]);
  for (const label of ["Power-on hours", "SSD endurance used"]) {
    if (!health?.metrics.some((metric) => metric.label === label)) metrics.push([label, "Not reported by this drive / provider"]);
  }
  const attributes = health?.attributes ?? [];
  const attributeTable = attributes.length ? `<details class="sensor-disclosure" data-sensor-disclosure="smart-${escapeHtml(drive.device)}">
    <summary>SMART attributes · ${attributes.length}</summary>
    <p class="help-text">Normalized values and thresholds are vendor-defined. Raw values may encode multiple counters.</p>
    <table class="hardware-table"><thead><tr>${["ID", "Attribute", "Current", "Worst", "Threshold", "Raw", "Failed"].map((label) => `<th scope="col">${label}</th>`).join("")}</tr></thead>
    <tbody>${attributes.map((attribute) => `<tr>${[attribute.id, attribute.name.replaceAll("_", " "), attribute.value ?? "—", attribute.worst ?? "—", attribute.threshold ?? "—", attribute.raw, attribute.failed || "—"].map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    </details>` : '<p class="help-text">No ATA attribute table reported. NVMe drives expose health counters instead.</p>';
  return renderSection(drive.name || `Drive ${index + 1}`, rows, `Drive ${index}`)
    + renderSection("Drive health", [["SMART assessment", health?.passed === true ? "Passed" : health?.passed === false ? "Failure reported" : null], ...metrics])
    + (health?.reason ? `<p class="help-text">${escapeHtml(health.reason)}</p>` : "")
    + '<p class="help-text">SSD endurance used is a wear estimate, not remaining life or free space. It can exceed 100%. Missing wear data is normal for hard disks.</p>'
    + attributeTable;
}

export function renderStorage(view: MonitorView): string {
  const volumes = (view.hardware.fsSize ?? []).filter((volume) => volume.size > 0);
  const drives = view.hardware.diskLayout ?? [];
  const hasApfs = volumes.some((volume) => volume.type?.toLowerCase() === "apfs");
  const sharedSpaceNote = hasApfs ? "APFS volumes share container capacity and free space. " : "";

  const storageSensors = view.sensors.filter((reading) => reading.group.startsWith("Storage sensors"));
  const sensorRows: TableRow[] = storageSensors.map((reading) => [reading.name, reading.value === null ? reading.reason : formatSensor(reading.value, reading.unit)]);
  return `
    <div class="page-actions"><button type="button" class="button" data-retry-sensors>${renderIcon("refresh", 14)}<span>Refresh storage health</span></button></div>
    ${renderSection("Drive sensors", sensorRows)}
    ${storageSensors.length ? "" : '<p class="help-text">Drive temperature, wear and health sensors are not exposed by the current provider on this machine.</p>'}
    ${renderHeading("Volumes", `${volumes.length} mounted`)}
    ${volumes.map(renderVolume).join("\n")}
    ${drives.map(renderDrive).join("\n")}
    <p class="help-text">${sharedSpaceNote}Volumes update every 30 s. Drive health is collected at startup and when refreshed.</p>
  `;
}
