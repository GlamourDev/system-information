import type { SensorReading } from "./types.js";

// Die probes are not necessarily one-per-core. Only use core labels supplied by
// a CPU provider, never the index of an Apple IOHID temperature probe.
export function thermalLayout(readings: readonly SensorReading[]) {
  const temperatures = readings.filter((reading) => reading.unit === "°C");
  const summary = [
    { id: "temperature", label: "CPU" },
    { id: "gpuTemperature", label: "GPU" },
    { id: "socTemperature", label: "Chip" },
  ].flatMap(({ id, label }) => {
    const reading = temperatures.find((item) => item.id === id)
      ?? (id === "gpuTemperature" ? temperatures.find((item) => item.id.startsWith("lhm:") && /gpu/i.test(item.id) && /core|temperature/i.test(item.name)) : undefined);
    return reading ? [{ ...reading, name: label }] : [];
  });
  const cores = temperatures.flatMap((reading) => {
    if (!reading.id.startsWith("lhm:") || !/cpu/i.test(reading.id)) return [];
    const match = reading.name.match(/^(?:CPU\s+)?(?:P-|E-)?Core\s*#?\s*(\d+)$/i);
    return match ? [{ ...reading, name: `Core ${match[1]}`, core: Number(match[1]) }] : [];
  }).sort((a, b) => a.group.localeCompare(b.group) || a.core - b.core);
  const used = new Set([...summary, ...cores].map((reading) => reading.id));
  const details = temperatures.filter((reading) => !used.has(reading.id));
  return { summary, cores, details, fans: readings.filter((reading) => reading.unit === "rpm") };
}
