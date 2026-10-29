import type { MonitorView } from "./model/types.js";
import { formatBytes, formatSensor } from "./lib/format.js";

export function createReport(name: string, view: MonitorView, createdAt = new Date()): string {
  const { hardware, sensors } = view;
  const graphics =
    hardware.graphics?.controllers.map((controller) => controller.model).join(", ") || "—";
  const readings = sensors.map(
    (sensor) => `${sensor.group} / ${sensor.name}: ${formatSensor(sensor.value, sensor.unit)}${sensor.reason ? ` (${sensor.reason})` : ""}`,
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
    ...Object.entries(hardware.issues ?? {}).map(([key, reason]) => `${key}: ${reason}`),
    view.sample?.extendedSensors?.status?.message || "",
    "Storage health",
    ...(hardware.diskLayout ?? []).flatMap((drive) => [
      `${drive.name || drive.device}: ${drive.health?.passed === true ? "SMART passed" : drive.health?.passed === false ? "SMART failure reported" : "SMART assessment unavailable"}`,
      ...(drive.health?.metrics ?? []).map((metric) => `  ${metric.label}: ${metric.unit === "bytes" ? formatBytes(metric.value) : `${metric.value} ${metric.unit}`.trim()}`),
      ...(drive.health?.reason ? [`  ${drive.health.reason}`] : []),
    ]),
    "",
    "Sensor readings",
    ...readings,
  ].join("\n");
}


export function createSensorCsv(view: MonitorView): string {
  const cell = (value: unknown) => {
    const text = String(value ?? "");
    const safe = /^[=+@\-\t\r]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const rows = ["timestamp,sensor_id,group,name,value,unit,reason"];
  for (const point of view.sensorHistory ?? []) {
    for (const reading of point.readings) {
      rows.push([new Date(point.at).toISOString(), reading.id, reading.group, reading.name, reading.value ?? "", reading.unit, reading.reason ?? ""].map(cell).join(","));
    }
  }
  return rows.join("\r\n");
}
