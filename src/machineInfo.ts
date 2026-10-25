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
  system: SI.SystemData;
  cpu: SI.CpuData;
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

function createProbe<T>(probe: () => Promise<T>) {
  let pending: Promise<T | null> | null = null;
  return async (timeout = 6000): Promise<T | null> => {
    if (!pending) {
      pending = Promise.resolve()
        .then(probe)
        .catch(() => null);
      void pending.finally(() => {
        pending = null;
      });
    }
    const task = pending;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        task,
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), timeout);
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
  system: createProbe(() => si.system()),
  cpu: createProbe(() => si.cpu()),
  osInfo: createProbe(() => si.osInfo()),
  baseboard: createProbe(() => si.baseboard()),
  memLayout: createProbe(() => si.memLayout()),
  graphics: createProbe(() => si.graphics()),
  diskLayout: createProbe(() => si.diskLayout()),
  fsSize: createProbe(() => si.fsSize()),
  networkInterfaces: createProbe(() => si.networkInterfaces()),
  currentLoad: createProbe(() => si.currentLoad()),
  mem: createProbe(() => si.mem()),
  cpuTemperature: createProbe(() => si.cpuTemperature()),
  networkStats: createProbe(() => si.networkStats()),
  disksIO: createProbe(() => si.disksIO()),
  battery: createProbe(() => si.battery()),
};

const privateFields: readonly PrivateHardwareField[] = [
  "serial",
  "serialNum",
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
    system: sanitizeNullable(system),
    cpu,
    osInfo: sanitizeNullable(osInfo),
    baseboard: sanitizeNullable(baseboard),
    memLayout: memLayout?.map(sanitize) ?? null,
    graphics,
    diskLayout: diskLayout?.map(sanitize) ?? null,
    fsSize,
    networkInterfaces,
    platform: process.platform,
    arch: arch(),
    totalMemory: totalmem(),
  };
}

export async function sample(): Promise<HardwareSample> {
  const [currentLoad, mem, cpuTemperature, networkStats, disksIO, battery] = await Promise.all([
    read("currentLoad"),
    read("mem"),
    read("cpuTemperature"),
    read("networkStats"),
    read("disksIO"),
    read("battery"),
  ]);
  return {
    currentLoad,
    mem,
    cpuTemperature,
    networkStats,
    disksIO,
    battery,
    at: Date.now(),
    uptime: uptime(),
  };
}

export async function volumes(): Promise<SI.FsSizeData[]> {
  return (await read("fsSize")) ?? [];
}
