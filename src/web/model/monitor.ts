import type { HardwareInventory, HardwareSample, MonitorSettings } from "../../types.js";
import { isFiniteNumber, nonnegative } from "../lib/format.js";
import { getMemoryPercent, getNetworkRate, getSensorReadings } from "./sensors.js";
import type { HistoryPoint, MonitorView, SensorReading, SensorStatistics, SensorHistoryPoint } from "./types.js";

const HISTORY_WINDOW_MS = 120_000;

export class MonitorModel {
  private hardware: HardwareInventory | null = null;
  private sample: HardwareSample | null = null;
  private sensors: SensorReading[] = [];
  private statistics = new Map<string, SensorStatistics>();
  private history: HistoryPoint[] = [];
  private sensorHistory: SensorHistoryPoint[] = [];
  temperatureAlert: number | null = null;
  settings: MonitorSettings = { paused: false, interval: 2000 };

  setHardware(hardware: HardwareInventory): void {
    this.hardware = hardware;
  }

  setSettings(settings: MonitorSettings): void {
    this.settings = { paused: settings.paused, interval: settings.interval };
  }

  acceptSample(sample: HardwareSample | null): boolean {
    if (!sample || !isFiniteNumber(sample.at)) return false;
    if (this.sample && sample.at <= this.sample.at) return false;

    this.sample = sample;
    this.sensors = getSensorReadings(sample);
    this.sensorHistory.push({ at: sample.at, readings: this.sensors });
    this.sensorHistory = this.sensorHistory.filter((point) => point.at >= sample.at - HISTORY_WINDOW_MS).slice(-121);
    for (const sensor of this.sensors) {
      if (!isFiniteNumber(sensor.value)) continue;
      const previous = this.statistics.get(sensor.id);
      this.statistics.set(sensor.id, {
        min: previous ? Math.min(previous.min, sensor.value) : sensor.value,
        max: previous ? Math.max(previous.max, sensor.value) : sensor.value,
        sum: (previous?.sum ?? 0) + sensor.value,
        count: (previous?.count ?? 0) + 1,
      });
    }

    this.history.push({
      at: sample.at,
      cpu: nonnegative(sample.currentLoad?.currentLoad),
      memory: getMemoryPercent(sample.mem),
      download: getNetworkRate(sample.networkStats, "rx_sec"),
      upload: getNetworkRate(sample.networkStats, "tx_sec"),
    });
    this.history = this.history.filter((point) => point.at >= sample.at - HISTORY_WINDOW_MS);
    return true;
  }

  get lastUpdated(): number | null {
    return this.sample?.at ?? null;
  }

  get view(): MonitorView | null {
    if (!this.hardware) return null;
    return {
      hardware: this.hardware,
      sample: this.sample,
      sensors: this.sensors,
      statistics: this.statistics,
      history: this.history,
      sensorHistory: this.sensorHistory,
      temperatureAlert: this.temperatureAlert,
    };
  }
}
