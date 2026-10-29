import { SensorProcess } from "./sensorProcess.js";
import { join } from "node:path";
import type { SensorReading } from "./web/model/types.js";

export interface ExtendedSensors {
  readings: SensorReading[];
  reason?: string;
  status?: { state: "ready" | "limited" | "error"; message: string; setupRequired?: boolean };
  disk?: { read: number | null; write: number | null; readBytes?: number | null; writeBytes?: number | null; reason?: string };
}

export function sensorNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function failureReason(error: unknown): string {
  const e = error as { code?: string; killed?: boolean; message?: string };
  if (e?.code === "ETIMEDOUT" || e?.killed) return "Sensor query timed out. Retry now or wait 30 seconds for an automatic retry.";
  if (e?.code === "ENOENT") return "The bundled sensor helper is missing. Extract the complete app archive again; source builds must run npm run build:windows-helper.";
  if (e?.code === "EACCES" || /access.*denied|permission/i.test(e?.message ?? "")) {
    return "Permission denied while reading sensors. Check access to the sensor provider.";
  }
  if (e?.code === "EPROTO") return "The sensor helper returned incompatible data. Reinstall a matching app build.";
  if (e?.code === "HELPER_EXIT") return "The sensor helper exited unexpectedly. Retry, or check whether Windows security blocked its driver.";
  if (e?.code === "HELPER_RESTART") return "Sensor helper restarting. A fresh reading will follow.";
  return "The sensor provider failed. Check its installation and restart it.";
}

interface WindowsPayload {
  administrator?: boolean;
  driverInstalled?: boolean;
  driverVersion?: string;
  errors?: string[];
  diskError?: string;
  sensors?: { Identifier?: string; Name?: string; SensorType?: string; Value?: unknown; Parent?: string; HardwareType?: string }[];
  sensorError?: string;
  disk?: { read?: unknown; write?: unknown; readBytes?: unknown; writeBytes?: unknown };
}

export function parseWindowsSensors(data: WindowsPayload): ExtendedSensors {
  const units: Record<string, SensorReading["unit"]> = { Temperature: "°C", Fan: "rpm", Power: "W", Voltage: "V", Load: "%", Clock: "MHz", Data: "GiB", SmallData: "MiB", Throughput: "rate", Level: "%", Factor: "×" };
  const readings: SensorReading[] = [];
  for (const sensor of Array.isArray(data.sensors) ? data.sensors : []) {
    const unit = units[sensor.SensorType ?? ""];
    if (!unit || !sensor.Identifier) continue;
    const value = sensorNumber(sensor.Value);
    readings.push({ id: `lhm:${sensor.Identifier}`, name: sensor.Name || sensor.Identifier,
      group: `${sensor.HardwareType === "Storage" ? "Storage sensors" : "Hardware sensors"} · ${sensor.Parent || "System"}`, unit, value,
      source: "Bundled Windows helper", reason: value === null ? "The hardware provider returned no valid value for this sensor." : undefined });
  }
  // CIM uint64 values may be serialized as decimal strings; reject empty strings and nulls.
  const counter = (value: unknown) => sensorNumber(typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value);
  const setupRequired = data.driverInstalled === false || (data.driverVersion !== undefined && Number(data.driverVersion.split(".")[0]) < 2);
  const reason = setupRequired ? "Low-level sensors need the bundled PawnIO driver. Choose Set up hardware sensors, finish the installer, then retry. Windows will request administrator permission."
    : data.sensorError === "permission" || !data.administrator
    ? "Some hardware sensors require administrator access. Quit the app (including its tray icon), then right-click System Information and choose Run as administrator."
    : data.sensorError ? "The bundled hardware provider could not open the sensors. Retry; if it persists, check Windows security/driver restrictions or hardware support."
      : data.errors?.length ? "Some devices could not be queried. Retry; hardware or driver support may be incomplete."
        : !readings.some((reading) => reading.value !== null) ? "The provider returned no usable sensor readings. Check driver access and hardware support."
          : "The bundled provider does not expose this sensor on this hardware.";
  const limited = Boolean(setupRequired || data.sensorError || !data.administrator || data.errors?.length || !readings.some((reading) => reading.value !== null));
  return { readings, reason,
    status: { state: limited ? "limited" : "ready", setupRequired, message: limited ? reason : "Bundled Windows sensor helper connected. No separate monitor or .NET installation is needed." },
    disk: { read: counter(data.disk?.read), write: counter(data.disk?.write), readBytes: counter(data.disk?.readBytes), writeBytes: counter(data.disk?.writeBytes),
      reason: data.diskError === "permission" ? "Permission denied reading Windows disk counters."
        : "Windows disk performance counters are unavailable. Check the WMI/PerfDisk services." },
  };
}

let helper: SensorProcess | null = null;
export function stopSensors() { helper?.stop(); helper = null; }

export async function extendedSensors(): Promise<ExtendedSensors> {
  try {
    if (!helper && process.platform === "win32") {
      const file = join(windowsSensorDirectory(), "SensorHelper.exe");
      helper = new SensorProcess(file);
    }
    if (!helper && process.platform === "darwin") {
      helper = new SensorProcess(process.execPath, [join(__dirname, "macSensors.js"), "--persistent"], { ...process.env, ELECTRON_RUN_AS_NODE: "1" });
    }
    if (helper) {
      const data = await helper.read();
      return process.platform === "win32" ? parseWindowsSensors(data as WindowsPayload) : data as ExtendedSensors;
    }
    return { readings: [], reason: "This sensor is not exposed by the current platform collector." };
  } catch (error) {
    const reason = failureReason(error);
    return { readings: [], reason, status: { state: "error", message: reason }, disk: process.platform === "win32" ? { read: null, write: null, reason } : undefined };
  }
}

export function cpuTemperatureFromSensors(data: ExtendedSensors | null) {
  const candidates = (data?.readings ?? []).filter((reading) => reading.unit === "°C" && reading.value !== null && reading.value > 0
    && (reading.id === "temperature" || (reading.id.startsWith("lhm:") && /cpu/i.test(reading.id))));
  const primary = candidates.find((reading) => reading.id === "temperature" || /package|tctl|tdie/i.test(reading.name)) || candidates[0];
  return primary ? { main: primary.value!, max: Math.max(...candidates.map((reading) => reading.value!)), cores: [], socket: [] } : null;
}

export function windowsSensorDirectory(): string {
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  return __dirname.includes("app.asar") && resources ? join(resources, "sensors")
    : join(__dirname, "..", "native", "windows", "publish", process.arch);
}
