import { readStorageHealth } from "./storageHealth.js";
import { extendedSensors, failureReason, cpuTemperatureFromSensors } from "./sensorProviders.js";
import * as si from "systeminformation";
import type { Systeminformation as SI } from "systeminformation";
import { arch, totalmem, uptime as systemUptime } from "node:os";
import type {
  HardwareInventory,
  HardwareSample,
  PrivateHardwareField,
  PublicHardwareData,
} from "./types.js";

interface ProbeResults {
  bios: SI.BiosData;
  usb: SI.UsbData[];
  audio: SI.AudioData[];
  system: SI.SystemData;
  cpu: SI.CpuData;
  cpuCurrentSpeed: SI.CpuCurrentSpeedData;
  osInfo: SI.OsData;
  baseboard: SI.BaseboardData;
  memLayout: SI.MemLayoutData[];
  graphics: SI.GraphicsData;
  diskLayout: SI.DiskLayoutData[];
  fsSize: SI.FsSizeData[];
  networkInterfaces: SI.NetworkInterfacesData[];
  currentLoad: SI.CurrentLoadData;
  mem: SI.MemData;
  cpuTemperature: SI.CpuTemperatureData;
  networkStats: SI.NetworkStatsData[];
  disksIO: SI.DisksIoData;
  battery: SI.BatteryData;
}

const sensorIssues: Record<string, string> = {};

function createProbe<T>(probe: () => Promise<T>, name: string) {
  let pending: Promise<T | null> | null = null;
  return async (timeout = 6000): Promise<T | null> => {
    if (!pending) {
      pending = Promise.resolve()
        .then(probe)
        .catch((error: unknown) => {
          sensorIssues[name] = failureReason(error);
          return null;
        });
      void pending.finally(() => {
        pending = null;
      });
    }
    delete sensorIssues[name];
    const task = pending;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        task,
        new Promise<null>((resolve) => {
          timer = setTimeout(() => {
            sensorIssues[name] = "Sensor query timed out. It will be retried on the next refresh.";
            resolve(null);
          }, timeout);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}

const probes: {
  [K in keyof ProbeResults]: (timeout?: number) => Promise<ProbeResults[K] | null>;
} = {
  bios: createProbe(() => si.bios(), "bios"),
  usb: createProbe(() => si.usb(), "usb"),
  audio: createProbe(() => si.audio(), "audio"),
  system: createProbe(() => si.system(), "system"),
  cpu: createProbe(() => si.cpu(), "cpu"),
  cpuCurrentSpeed: createProbe(() => si.cpuCurrentSpeed(), "cpuCurrentSpeed"),
  osInfo: createProbe(() => si.osInfo(), "osInfo"),
  baseboard: createProbe(() => si.baseboard(), "baseboard"),
  memLayout: createProbe(() => si.memLayout(), "memLayout"),
  graphics: createProbe(() => si.graphics(), "graphics"),
  diskLayout: createProbe(() => si.diskLayout(), "diskLayout"),
  fsSize: createProbe(() => si.fsSize(), "fsSize"),
  networkInterfaces: createProbe(() => si.networkInterfaces(), "networkInterfaces"),
  currentLoad: createProbe(() => si.currentLoad(), "currentLoad"),
  mem: createProbe(() => si.mem(), "mem"),
  cpuTemperature: createProbe(() => si.cpuTemperature(), "cpuTemperature"),
  networkStats: createProbe(() => si.networkStats(), "networkStats"),
  disksIO: createProbe(() => si.disksIO(), "disksIO"),
  battery: createProbe(() => si.battery(), "battery"),
};

const privateFields: readonly PrivateHardwareField[] = [
  "serial",
  "serialNum",
  "serialNumber",
  "uuid",
  "assetTag",
  "hostname",
  "fqdn",
];

function sanitize<T extends object>(value: T): PublicHardwareData<T> {
  const copy = { ...value };
  for (const key of privateFields) Reflect.deleteProperty(copy, key);
  return copy;
}

function sanitizeNullable<T extends object>(value: T | null): PublicHardwareData<T> | null {
  return value === null ? null : sanitize(value);
}

function uptime(): number | null {
  try {
    return systemUptime();
  } catch {
    return null;
  }
}

function read<K extends keyof ProbeResults>(
  name: K,
  timeout = 6000,
): Promise<ProbeResults[K] | null> {
  return probes[name](timeout);
}

export async function inventory(): Promise<HardwareInventory> {
  const [
    bios,
    usb,
    audio,
    system,
    cpu,
    osInfo,
    baseboard,
    memLayout,
    graphics,
    diskLayout,
    fsSize,
    networkInterfaces,
  ] = await Promise.all([
    read("bios", 12000),
    read("usb", 12000),
    read("audio", 12000),
    read("system", 12000),
    read("cpu", 12000),
    read("osInfo", 12000),
    read("baseboard", 12000),
    read("memLayout", 12000),
    read("graphics", 12000),
    read("diskLayout", 12000),
    read("fsSize", 12000),
    read("networkInterfaces", 12000),
  ]);
  return {
    issues: Object.fromEntries(Object.entries({ bios, usb, audio, system, cpu, osInfo, baseboard, memLayout, graphics, diskLayout, fsSize, networkInterfaces }).filter(([, value]) => value === null || (Array.isArray(value) && !value.length)).map(([key]) => [key, sensorIssues[key] || "The operating system did not expose this hardware information."])),
    bios: sanitizeNullable(bios),
    usb: usb?.map(sanitize) ?? null,
    audio,
    system: sanitizeNullable(system),
    cpu,
    osInfo: sanitizeNullable(osInfo),
    baseboard: sanitizeNullable(baseboard),
    memLayout: memLayout?.map(sanitize) ?? null,
    graphics,
    diskLayout: diskLayout ? await Promise.all(diskLayout.map(async (disk) => {
      const { smartData, ...safe } = sanitize(disk);
      return { ...safe, health: await readStorageHealth(disk.device, smartData) };
    })) : null,
    fsSize,
    networkInterfaces,
    platform: process.platform,
    arch: arch(),
    totalMemory: totalmem(),
  };
}

const readExtended = createProbe(extendedSensors, "extendedSensors");

export async function sample(): Promise<HardwareSample> {
  const [currentLoad, mem, cpuTemperature, networkStats, disksIO, battery, extended, cpuCurrentSpeed] = await Promise.all([
    read("currentLoad"),
    read("mem"),
    process.platform === "darwin" || process.platform === "win32" ? Promise.resolve(null) : read("cpuTemperature"),
    read("networkStats"),
    read("disksIO"),
    read("battery"),
    readExtended(15000),
    read("cpuCurrentSpeed"),
  ]);
  return {
    currentLoad,
    cpuCurrentSpeed,
    mem,
    cpuTemperature: cpuTemperatureFromSensors(extended) ?? cpuTemperature,
    networkStats,
    disksIO,
    battery,
    extendedSensors: extended ?? { readings: [], reason: sensorIssues.extendedSensors || "Sensor provider unavailable." },
    sensorIssues: { ...sensorIssues },
    at: Date.now(),
    uptime: uptime(),
  };
}

export async function volumes(): Promise<SI.FsSizeData[]> {
  return (await read("fsSize")) ?? [];
}

export { stopSensors } from "./sensorProviders.js";
