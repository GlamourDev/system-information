import type { HardwareInventory, HardwareSample } from "../../types.js";

export type SensorUnit = "%" | "°C" | "bytes" | "rate" | "ops/s" | "V" | "W" | "rpm";

export interface SensorReading {
  id: string;
  group: string;
  name: string;
  value: number | null;
  unit: SensorUnit;
}

export interface SensorStatistics {
  min: number;
  max: number;
  sum: number;
  count: number;
}

export interface HistoryPoint {
  at: number;
  cpu: number | null;
  memory: number | null;
  download: number | null;
  upload: number | null;
}

export type GraphSeries = Exclude<keyof HistoryPoint, "at">;
export type TableRow = readonly [
  label: string,
  value: string | number | boolean | null | undefined,
];

export interface MonitorView {
  readonly hardware: HardwareInventory;
  readonly sample: HardwareSample | null;
  readonly sensors: readonly SensorReading[];
  readonly statistics: ReadonlyMap<string, SensorStatistics>;
  readonly history: readonly HistoryPoint[];
}
