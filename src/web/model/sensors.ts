import type { HardwareSample } from "../../types.js";
import { isFiniteNumber, nonnegative, positive } from "../lib/format.js";
import type { SensorReading } from "./types.js";

export function getActiveMemory(memory: HardwareSample["mem"]): number | null {
  if (!memory) return null;
  if (isFiniteNumber(memory.active) && memory.active >= 0) return memory.active;
  if (isFiniteNumber(memory.total) && isFiniteNumber(memory.available)) {
    return nonnegative(memory.total - memory.available);
  }
  return nonnegative(memory.used);
}

export function getMemoryPercent(memory: HardwareSample["mem"]): number | null {
  const active = getActiveMemory(memory);
  if (!memory || !positive(memory.total) || active === null) return null;
  return (active / memory.total) * 100;
}

export function getNetworkRate(
  interfaces: HardwareSample["networkStats"],
  direction: "rx_sec" | "tx_sec",
): number | null {
  const values = (interfaces ?? [])
    .filter((item) => item.iface !== "lo" && item.iface !== "lo0" && item.operstate === "up")
    .map((item) => nonnegative(item[direction]))
    .filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

export function getSensorReadings(sample: HardwareSample): SensorReading[] {
  const readings: SensorReading[] = [
    {
      id: "cpu",
      group: "Processor",
      name: "Total CPU usage",
      value: nonnegative(sample.currentLoad?.currentLoad),
      unit: "%",
    },
    {
      id: "user",
      group: "Processor",
      name: "User",
      value: nonnegative(sample.currentLoad?.currentLoadUser),
      unit: "%",
    },
    {
      id: "system",
      group: "Processor",
      name: "System",
      value: nonnegative(sample.currentLoad?.currentLoadSystem),
      unit: "%",
    },
    {
      id: "temperature",
      group: "Processor",
      name: "CPU temperature",
      value: positive(sample.cpuTemperature?.main),
      unit: "°C",
    },
  ];

  for (const [index, core] of (sample.currentLoad?.cpus ?? []).entries()) {
    readings.push({
      id: `core${index}`,
      group: "Processor cores",
      name: `Core ${String(index + 1).padStart(2, "0")}`,
      value: nonnegative(core.load),
      unit: "%",
    });
  }

  readings.push(
    {
      id: "memoryUsed",
      group: "Memory",
      name: "Active memory",
      value: getActiveMemory(sample.mem),
      unit: "bytes",
    },
    {
      id: "memoryAvailable",
      group: "Memory",
      name: "Available memory",
      value: nonnegative(sample.mem?.available),
      unit: "bytes",
    },
    {
      id: "memoryPercent",
      group: "Memory",
      name: "Memory usage",
      value: getMemoryPercent(sample.mem),
      unit: "%",
    },
    {
      id: "swap",
      group: "Memory",
      name: "Swap used",
      value: nonnegative(sample.mem?.swapused),
      unit: "bytes",
    },
    {
      id: "read",
      group: "Storage",
      name: "Read operations",
      value: nonnegative(sample.disksIO?.rIO_sec),
      unit: "ops/s",
    },
    {
      id: "write",
      group: "Storage",
      name: "Write operations",
      value: nonnegative(sample.disksIO?.wIO_sec),
      unit: "ops/s",
    },
    {
      id: "download",
      group: "Network",
      name: "Download",
      value: getNetworkRate(sample.networkStats, "rx_sec"),
      unit: "rate",
    },
    {
      id: "upload",
      group: "Network",
      name: "Upload",
      value: getNetworkRate(sample.networkStats, "tx_sec"),
      unit: "rate",
    },
  );

  if (sample.battery?.hasBattery) {
    readings.push(
      {
        id: "battery",
        group: "Battery",
        name: "Charge",
        value: nonnegative(sample.battery.percent),
        unit: "%",
      },
      {
        id: "voltage",
        group: "Battery",
        name: "Voltage",
        value: positive(sample.battery.voltage),
        unit: "V",
      },
      {
        id: "power",
        group: "Battery",
        name: "Power draw",
        value: positive(sample.battery.powerConsumption),
        unit: "W",
      },
    );
  }

  return readings;
}
