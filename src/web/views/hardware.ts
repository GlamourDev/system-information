import { renderIcon } from "../components/icons.js";
import { renderHeading, renderSection } from "../components/table.js";
import { escapeHtml } from "../lib/dom.js";
import { formatBytes, positive } from "../lib/format.js";
import type { MonitorView, TableRow } from "../model/types.js";

export function renderHardware(view: MonitorView): string {
  const { hardware } = view;
  const board = hardware.baseboard;
  const bios = hardware.bios;
  const unavailable = (key: string, fallback: string) =>
    `<p class="sensor-status">${escapeHtml(hardware.issues?.[key] || fallback)}</p>`;
  const devices = <T,>(title: string, key: string, items: T[] | null | undefined,
    name: (item: T, index: number) => string, rows: (item: T) => TableRow[]) =>
    `${renderHeading(title, `${items?.length ?? 0} detected`)}${items?.length
      ? items.map((item, index) => `<details class="sensor-disclosure" data-sensor-disclosure="hardware-${key}-${index}"><summary>${escapeHtml(name(item, index))}</summary>${renderSection("Device details", rows(item))}</details>`).join("")
      : unavailable(key, "No devices were reported. The operating system may not expose this device list.")}`;

  return `
    <div class="sensor-status"><p>Collected at startup. Refresh after connecting or removing a device. Available details depend on your hardware and operating system.</p><button type="button" class="button" data-retry-sensors>${renderIcon("refresh", 14)}<span>Refresh hardware</span></button></div>
    <div class="details-grid">
      <section>${renderSection("Motherboard", [
        ["Manufacturer", board?.manufacturer], ["Model", board?.model],
        ["Version", board?.version], ["Memory slots", positive(board?.memSlots) ? board?.memSlots : null],
        ["Maximum memory", positive(board?.memMax) ? formatBytes(board?.memMax) : null],
      ])}${hardware.issues?.baseboard ? unavailable("baseboard", "") : ""}</section>
      <section>${renderSection("BIOS / firmware", [
        ["Vendor", bios?.vendor], ["Version", bios?.version],
        ["Release date", bios?.releaseDate], ["Revision", bios?.revision],
      ])}${hardware.issues?.bios ? unavailable("bios", "") : ""}</section>
      <section>${devices("USB devices", "usb", hardware.usb,
        (device, index) => device.name || `USB device ${index + 1}`, (device) => [
          ["Manufacturer", device.manufacturer || device.vendor], ["Type", device.type],
          ["Bus", device.bus || null], ["Maximum power", device.maxPower],
        ])}</section>
      <section>${devices("Audio devices", "audio", hardware.audio,
        (device, index) => device.name || `Audio device ${index + 1}`, (device) => [
          ["Manufacturer", device.manufacturer], ["Type", device.type],
          ["Channels", device.channel], ["Driver", device.driver],
          ["Revision", device.revision], ["Status", device.status],
        ])}</section>
    </div>`;
}
