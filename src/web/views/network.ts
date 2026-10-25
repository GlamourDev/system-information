import type { Systeminformation as SI } from "systeminformation";
import type { MonitorView, TableRow } from "../model/types.js";
import { formatBytes, formatSensor, positive } from "../lib/format.js";
import { renderChart } from "../components/chart.js";
import { renderSection } from "../components/table.js";

function renderInterface(network: SI.NetworkInterfacesData, view: MonitorView): string {
  const readings = view.sample?.networkStats?.find((item) => item.iface === network.iface);
  const rows: TableRow[] = [
    ["Interface", network.iface],
    ["Type", network.type],
    ["State", readings?.operstate || network.operstate],
    ["IPv4", network.ip4],
    ["Link speed", positive(network.speed) ? `${network.speed} Mbps` : null],
    ["Received", formatBytes(readings?.rx_bytes)],
    ["Sent", formatBytes(readings?.tx_bytes)],
  ];

  return renderSection(network.ifaceName || network.iface, rows, network.default ? "Default" : "");
}

export function renderNetwork(view: MonitorView): string {
  const latest = view.history.at(-1);
  const interfaces = (view.hardware.networkInterfaces ?? []).filter(
    (item) => !item.internal && (item.operstate === "up" || item.ip4 || item.ip6),
  );
  const download = renderChart({
    title: "Download",
    value: formatSensor(latest?.download, "rate"),
    history: view.history,
    series: "download",
    max: null,
  });
  const upload = renderChart({
    title: "Upload",
    value: formatSensor(latest?.upload, "rate"),
    history: view.history,
    series: "upload",
    max: null,
  });
  const details = interfaces.length
    ? interfaces.map((network) => renderInterface(network, view)).join("\n")
    : '<div class="empty-state">No active network interfaces</div>';

  return `
    <div class="charts">
      ${download}
      ${upload}
    </div>
    ${details}
    <p class="help-text">Transfer rates use the default interface.</p>
  `;
}
