import type { MonitorView } from "./model/types.js";
import { formatBytes, formatSensor } from "./lib/format.js";

export function createReport(name: string, view: MonitorView, createdAt = new Date()): string {
  const { hardware, sensors } = view;
  const graphics =
    hardware.graphics?.controllers.map((controller) => controller.model).join(", ") || "—";
  const readings = sensors.map(
    (sensor) => `${sensor.group} / ${sensor.name}: ${formatSensor(sensor.value, sensor.unit)}`,
  );

  return [
    `${name} — ${createdAt.toLocaleString()}`,
    "",
    `Machine: ${hardware.system?.manufacturer || ""} ${hardware.system?.model || ""}`,
    `OS: ${hardware.osInfo?.distro || ""} ${hardware.osInfo?.release || ""} (${hardware.arch})`,
    `Processor: ${hardware.cpu?.brand || "—"}`,
    `Cores: ${hardware.cpu?.physicalCores || "—"} physical / ${hardware.cpu?.cores || "—"} logical`,
    `Memory: ${formatBytes(hardware.totalMemory)}`,
    `Graphics: ${graphics}`,
    "",
    "Sensor readings",
    ...readings,
  ].join("\n");
}
