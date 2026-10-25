import { renderChart } from "../components/chart.js";
import { renderCapacityBar, renderHeading, renderSection } from "../components/table.js";
import { formatBytes, formatNumber, formatSensor, positive } from "../lib/format.js";
import type { MonitorView, TableRow } from "../model/types.js";

export function renderProcessor(view: MonitorView): string {
  const { hardware, sample, history } = view;
  const cpu = hardware.cpu;
  const cores = sample?.currentLoad?.cpus ?? [];

  const processorRows: TableRow[] = [
    ["Model", cpu?.brand],
    ["Manufacturer", cpu?.manufacturer],
    ["Socket", cpu?.socket],
  ];
  const configurationRows: TableRow[] = [
    ["Physical cores", cpu?.physicalCores],
    ["Logical processors", cpu?.cores],
    ["Performance cores", cpu?.performanceCores],
    ["Efficiency cores", cpu?.efficiencyCores],
    ["Base frequency", positive(cpu?.speed) ? `${formatNumber(cpu?.speed, 2)} GHz` : null],
    ["Architecture", hardware.arch],
  ];
  const cacheRows: TableRow[] = [
    ["L1 data", positive(cpu?.cache?.l1d) ? formatBytes(cpu?.cache?.l1d, 0) : null],
    ["L1 instruction", positive(cpu?.cache?.l1i) ? formatBytes(cpu?.cache?.l1i, 0) : null],
    ["L2", positive(cpu?.cache?.l2) ? formatBytes(cpu?.cache?.l2, 0) : null],
    ["L3", positive(cpu?.cache?.l3) ? formatBytes(cpu?.cache?.l3, 0) : null],
  ];
  const coreMeters = cores
    .map(
      (core, index) => `
    <div class="processor-core">
      <div class="processor-core__header">
        <span>Core ${String(index + 1).padStart(2, "0")}</span>
        <strong class="processor-core__value">${formatNumber(core.load, 0)} %</strong>
      </div>
      ${renderCapacityBar(core.load, true)}
    </div>
  `,
    )
    .join("");

  return `
    <div class="charts">
      ${renderChart({
        title: "Total utilization",
        value: formatSensor(sample?.currentLoad?.currentLoad, "%"),
        history,
        series: "cpu",
      })}
      <section>${renderSection("Processor", processorRows)}</section>
    </div>
    ${renderHeading("Logical processors", `${cores.length} cores`)}
    <div class="processor-grid">${coreMeters}</div>
    <div class="details-grid">
      <section>${renderSection("Configuration", configurationRows)}</section>
      <section>${renderSection("Cache", cacheRows)}</section>
    </div>
  `;
}
