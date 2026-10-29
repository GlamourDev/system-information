import type { StorageHealth } from "./storageHealth.js";
import type { ExtendedSensors } from "./sensorProviders.js";
import type { Systeminformation as SI } from "systeminformation";

export type SampleInterval = 1000 | 2000 | 5000;

export interface MonitorSettings {
  paused: boolean;
  interval: SampleInterval;
}

export type PrivateHardwareField =
  "serial" | "serialNumber" | "serialNum" | "uuid" | "assetTag" | "hostname" | "fqdn";

export type PublicHardwareData<T> = Omit<T, PrivateHardwareField>;

export interface HardwareInventory {
  issues?: Record<string, string>;
  system: PublicHardwareData<SI.SystemData> | null;
  bios: PublicHardwareData<SI.BiosData> | null;
  usb: PublicHardwareData<SI.UsbData>[] | null;
  audio: SI.AudioData[] | null;
  cpu: SI.CpuData | null;
  osInfo: PublicHardwareData<SI.OsData> | null;
  baseboard: PublicHardwareData<SI.BaseboardData> | null;
  memLayout: PublicHardwareData<SI.MemLayoutData>[] | null;
  graphics: SI.GraphicsData | null;
  diskLayout: (Omit<PublicHardwareData<SI.DiskLayoutData>, "smartData"> & { health?: StorageHealth })[] | null;
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
  cpuCurrentSpeed?: SI.CpuCurrentSpeedData | null;
  currentLoad: SI.CurrentLoadData | null;
  mem: SI.MemData | null;
  cpuTemperature: SI.CpuTemperatureData | null;
  networkStats: SI.NetworkStatsData[] | null;
  disksIO: SI.DisksIoData | null;
  battery: BatteryReading | null;
  extendedSensors?: ExtendedSensors;
  sensorIssues?: Record<string, string>;
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
  saveSensorHistory(csv: string): Promise<boolean>;
  setupSensors(): Promise<void>;
  retrySensors(): Promise<void>;
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
