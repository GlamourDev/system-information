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

  readings.push({ id: "cpuFrequency", name: "Reported CPU frequency", group: "Processor", value: positive(sample.cpuCurrentSpeed?.avg) === null ? null : sample.cpuCurrentSpeed!.avg * 1000, unit: "MHz", reason: sample.sensorIssues?.cpuCurrentSpeed });
  const extended = sample.extendedSensors;
  if (extended?.disk) {
    readings.find((reading) => reading.id === "read")!.value = extended.disk.read;
    readings.find((reading) => reading.id === "write")!.value = extended.disk.write;
    for (const reading of readings.filter((item) => item.id === "read" || item.id === "write")) {
      reading.source = "Windows PerfDisk";
      reading.reason = reading.value === null ? extended.disk.reason : undefined;
    }
  }
  if (extended?.disk) {
    readings.push(
      { id: "diskReadBytes", name: "Read throughput", group: "Storage", value: extended.disk.readBytes ?? null, unit: "rate", reason: extended.disk.reason },
      { id: "diskWriteBytes", name: "Write throughput", group: "Storage", value: extended.disk.writeBytes ?? null, unit: "rate", reason: extended.disk.reason },
    );
  }
  for (const [index, value] of (sample.cpuTemperature?.cores ?? []).entries()) {
    readings.push({ id: `cpuDie${index}`, group: "Thermals", name: `CPU temperature sensor ${index + 1}`, value: positive(value), unit: "°C" });
  }
  for (const reading of extended?.readings ?? []) {
    const index = readings.findIndex((item) => item.id === reading.id);
    if (index >= 0) readings[index] = { ...reading };
    else readings.push({ ...reading });
  }
  // A CPU package reading is preferred; do not relabel an ACPI thermal zone as a CPU core.
  const cpuCandidates = readings.filter((reading) => reading.id.startsWith("lhm:") && /cpu|intelcpu|amdcpu/i.test(reading.id) && reading.unit === "°C" && reading.value !== null);
  const cpu = cpuCandidates.find((reading) => /package|tctl|tdie/i.test(reading.name)) || cpuCandidates[0];
  if (cpu) Object.assign(readings.find((reading) => reading.id === "temperature")!, { value: cpu.value, source: cpu.source });
  if (extended) {
    const expected: SensorReading[] = [
      { id: "gpuTemperature", group: "Thermals", name: "GPU temperature", value: null, unit: "°C" },
      { id: "fansUnavailable", group: "Fans", name: "Fan speed", value: null, unit: "rpm" },
      { id: "powerUnavailable", group: "Power", name: "Hardware power", value: null, unit: "W" },
      { id: "voltageUnavailable", group: "Power", name: "Hardware voltage", value: null, unit: "V" },
    ];
    for (const reading of expected) {
      const present = reading.id === "gpuTemperature"
        ? readings.some((item) => item.unit === "°C" && /gpu/i.test(item.id))
        : readings.some((item) => item.unit === reading.unit && item.id !== "power" && item.id !== "voltage");
      if (!present) readings.push(reading);
    }
  }
  const issueKeys: Record<string, string> = { cpu: "currentLoad", user: "currentLoad", system: "currentLoad", temperature: "cpuTemperature", memoryUsed: "mem", memoryAvailable: "mem", memoryPercent: "mem", swap: "mem", read: "disksIO", write: "disksIO", download: "networkStats", upload: "networkStats", battery: "battery", voltage: "battery", power: "battery" };
  for (const reading of readings) {
    if (reading.value !== null) { reading.reason = undefined; continue; }
    const thermal = reading.unit === "°C" || reading.unit === "rpm" || reading.id.endsWith("Unavailable");
    reading.reason ??= sample.sensorIssues?.[issueKeys[reading.id] || ""]
      || (thermal ? extended?.reason : undefined)
      || (reading.id === "download" || reading.id === "upload" ? "No active interface has a valid transfer rate yet. The first sample may need a second refresh."
        : "The operating system or device did not return a valid reading for this sensor.");
  }
  // Keep groups together even when several providers contribute readings.
  const groups = [...new Set(readings.map((reading) => reading.group))];
  return groups.flatMap((group) => readings.filter((reading) => reading.group === group));
}
