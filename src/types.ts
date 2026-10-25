import type { Systeminformation as SI } from "systeminformation";

export type SampleInterval = 1000 | 2000 | 5000;

export interface MonitorSettings {
  paused: boolean;
  interval: SampleInterval;
}

export type PrivateHardwareField =
  "serial" | "serialNum" | "uuid" | "assetTag" | "hostname" | "fqdn";

export type PublicHardwareData<T> = Omit<T, PrivateHardwareField>;

export interface HardwareInventory {
  system: PublicHardwareData<SI.SystemData> | null;
  cpu: SI.CpuData | null;
  osInfo: PublicHardwareData<SI.OsData> | null;
  baseboard: PublicHardwareData<SI.BaseboardData> | null;
  memLayout: PublicHardwareData<SI.MemLayoutData>[] | null;
  graphics: SI.GraphicsData | null;
  diskLayout: PublicHardwareData<SI.DiskLayoutData>[] | null;
  fsSize: SI.FsSizeData[] | null;
  networkInterfaces: SI.NetworkInterfacesData[] | null;
  platform: NodeJS.Platform;
  arch: string;
  totalMemory: number;
}

export type BatteryReading = SI.BatteryData & {
  powerConsumption?: number | null;
};

export interface HardwareSample {
  currentLoad: SI.CurrentLoadData | null;
  mem: SI.MemData | null;
  cpuTemperature: SI.CpuTemperatureData | null;
  networkStats: SI.NetworkStatsData[] | null;
  disksIO: SI.DisksIoData | null;
  battery: BatteryReading | null;
  at: number;
  uptime: number | null;
}

export interface BootstrapData extends MonitorSettings {
  hardware: HardwareInventory;
  sample: HardwareSample | null;
}

export interface HardwareEvents {
  "hardware:settings": MonitorSettings;
  "hardware:sample": HardwareSample;
  "hardware:inventory": HardwareInventory;
}

export interface HardwareAPI {
  readonly platform: NodeJS.Platform;
  readonly info: {
    readonly name: string;
    readonly version: string;
    readonly description: string;
  };
  bootstrap(): Promise<BootstrapData>;
  pause(value: boolean): Promise<boolean>;
  interval(value: SampleInterval): Promise<SampleInterval>;
  copy(report: string): Promise<void>;
  onSettings(callback: (settings: MonitorSettings) => void): void;
  onSample(callback: (sample: HardwareSample) => void): void;
  onInventory(callback: (hardware: HardwareInventory) => void): void;
}

declare global {
  interface Window {
    hardware: HardwareAPI;
  }
}
