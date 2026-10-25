import { renderChart } from "../components/chart.js";
import { renderSection } from "../components/table.js";
import {
  formatBytes,
  formatDuration,
  formatNumber,
  formatSensor,
  positive,
} from "../lib/format.js";
import { getActiveMemory, getMemoryPercent } from "../model/sensors.js";
import type { MonitorView, TableRow } from "../model/types.js";

export function renderOverview(view: MonitorView): string {
  const { hardware, sample, history } = view;
  const cpu = hardware.cpu;
  const os = hardware.osInfo;
  const gpu = hardware.graphics?.controllers[0];
  const memoryTypes = [
    ...new Set((hardware.memLayout ?? []).map((module) => module.type).filter(Boolean)),
  ];

  const processorRows: TableRow[] = [
    ["Model", cpu?.brand],
    ["Physical / logical", `${cpu?.physicalCores || "—"} / ${cpu?.cores || "—"}`],
    [
      "Core layout",
      cpu?.performanceCores || cpu?.efficiencyCores
        ? `${cpu.performanceCores || 0} performance · ${cpu.efficiencyCores || 0} efficiency`
        : null,
    ],
    ["Base frequency", positive(cpu?.speed) ? `${formatNumber(cpu?.speed, 2)} GHz` : null],
  ];
  const systemRows: TableRow[] = [
    ["System", os?.distro],
    ["Release", os?.release],
    ["Kernel", os?.kernel],
    ["Uptime", formatDuration(sample?.uptime)],
  ];
  const memoryRows: TableRow[] = [
    ["Installed memory", formatBytes(hardware.totalMemory)],
    ["Active memory", formatBytes(getActiveMemory(sample?.mem ?? null))],
    ["Memory type", memoryTypes.join(", ")],
    ["Graphics", gpu?.model],
    [
      "Graphics memory",
      gpu?.vramDynamic ? "Shared system memory" : positive(gpu?.vram) ? `${gpu?.vram} MB` : null,
    ],
  ];
  const machineRows: TableRow[] = [
    ["Manufacturer", hardware.system?.manufacturer],
    ["Model", hardware.system?.model || "Computer"],
    ["Architecture", hardware.arch],
  ];

  return `
    <div class="charts">
      ${renderChart({
        title: "CPU utilization",
        value: formatSensor(sample?.currentLoad?.currentLoad, "%"),
        history,
        series: "cpu",
      })}
      ${renderChart({
        title: "Memory usage",
        value: formatSensor(getMemoryPercent(sample?.mem ?? null), "%"),
        history,
        series: "memory",
      })}
    </div>
    <div class="details-grid">
      <section>
        ${renderSection("Processor", processorRows)}
        ${renderSection("Operating system", systemRows)}
      </section>
      <section>
        ${renderSection("Memory & graphics", memoryRows)}
        ${renderSection("Machine", machineRows)}
      </section>
    </div>
  `;
}
