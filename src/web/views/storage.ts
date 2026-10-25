import type { Systeminformation as SI } from "systeminformation";
import type { MonitorView, TableRow } from "../model/types.js";
import { escapeHtml } from "../lib/dom.js";
import { formatBytes, formatNumber, isFiniteNumber } from "../lib/format.js";
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

  return renderSection(drive.name || `Drive ${index + 1}`, rows, `Drive ${index}`);
}

export function renderStorage(view: MonitorView): string {
  const volumes = (view.hardware.fsSize ?? []).filter((volume) => volume.size > 0);
  const drives = view.hardware.diskLayout ?? [];
  const hasApfs = volumes.some((volume) => volume.type?.toLowerCase() === "apfs");
  const sharedSpaceNote = hasApfs ? "APFS volumes share container capacity and free space. " : "";

  return `
    ${renderHeading("Volumes", `${volumes.length} mounted`)}
    ${volumes.map(renderVolume).join("\n")}
    ${drives.map(renderDrive).join("\n")}
    <p class="help-text">${sharedSpaceNote}Updated every 30 s.</p>
  `;
}
