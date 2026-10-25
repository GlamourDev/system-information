import { renderChart } from "../components/chart.js";
import { renderSection } from "../components/table.js";
import { formatBytes, formatSensor, positive } from "../lib/format.js";
import { getActiveMemory, getMemoryPercent } from "../model/sensors.js";
import type { MonitorView, TableRow } from "../model/types.js";

export function renderMemory(view: MonitorView): string {
  const { hardware, sample, history } = view;
  const memory = sample?.mem ?? null;

  const physicalRows: TableRow[] = [
    ["Installed", formatBytes(memory?.total || hardware.totalMemory)],
    ["Active", formatBytes(getActiveMemory(memory))],
    ["Available", formatBytes(memory?.available)],
  ];
  const allocationRows: TableRow[] = [
    ["Free", formatBytes(memory?.free)],
    ["Buffers & cache", formatBytes(memory?.buffcache)],
    ["Swap total", formatBytes(memory?.swaptotal)],
    ["Swap used", formatBytes(memory?.swapused)],
    ["Swap free", formatBytes(memory?.swapfree)],
  ];
  const modules = (hardware.memLayout ?? [])
    .map((module, index) => {
      const rows: TableRow[] = [
        ["Capacity", formatBytes(module.size)],
        ["Type", module.type],
        ["Manufacturer", module.manufacturer],
        ["Bank", module.bank],
        ["Form factor", module.formFactor],
        ["Clock speed", positive(module.clockSpeed) ? `${module.clockSpeed} MHz` : null],
      ];
      return renderSection(`Memory ${index + 1}`, rows);
    })
    .join("");

  return `
    <div class="charts">
      ${renderChart({
        title: "Memory usage",
        value: formatSensor(getMemoryPercent(memory), "%"),
        history,
        series: "memory",
      })}
      <section>${renderSection("Physical memory", physicalRows)}</section>
    </div>
    ${renderSection("Allocation", allocationRows)}
    ${modules}
    <p class="help-text">
      Active memory excludes reclaimable cache. GPU memory may be shared.
    </p>
  `;
}
