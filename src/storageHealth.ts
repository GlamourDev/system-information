import type { Systeminformation as SI } from "systeminformation";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface StorageHealth {
  checkedAt: number;
  reason?: string;
  passed: boolean | null;
  metrics: { label: string; value: number; unit: string }[];
  attributes: { id: number; name: string; value: number | null; worst: number | null; threshold: number | null; raw: string; failed: string }[];
}
const numeric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

// Whitelist health fields: never forward raw smartctl JSON, serial numbers or WWNs.
export function parseStorageHealth(input: unknown): StorageHealth {
  const data = input as (SI.SmartData & {
    endurance_used?: { current_percent?: number };
    spare_available?: { current_percent?: number; threshold_percent?: number };
  }) | null;
  const result: StorageHealth = { checkedAt: Date.now(), passed: typeof data?.smart_status?.passed === "boolean" ? data.smart_status.passed : null, metrics: [], attributes: [] };
  const add = (label: string, value: unknown, unit = "") => {
    const number = numeric(value);
    if (number !== null) result.metrics.push({ label, value: number, unit });
  };
  const nvme = data?.nvme_smart_health_information_log;
  add("Power-on hours", data?.power_on_time?.hours ?? nvme?.power_on_hours, "h");
  add("Power cycles", data?.power_cycle_count ?? nvme?.power_cycles);
  add("Temperature", data?.temperature?.current ?? nvme?.temperature, "°C");
  add("SSD endurance used", data?.endurance_used?.current_percent ?? nvme?.percentage_used, "%");
  add("Available spare", data?.spare_available?.current_percent ?? nvme?.available_spare, "%");
  add("Spare threshold", data?.spare_available?.threshold_percent ?? nvme?.available_spare_threshold, "%");
  add("Unsafe shutdowns", nvme?.unsafe_shutdowns);
  add("Media / data integrity errors", nvme?.media_errors);
  add("Error log entries", nvme?.num_err_log_entries ?? data?.ata_smart_error_log?.summary?.count);
  add("Critical warning flags", nvme?.critical_warning);
  for (const [label, key] of [["Data read", "data_units_read"], ["Data written", "data_units_written"]] as const) {
    const units = numeric(nvme?.[key]);
    if (units !== null && Number.isSafeInteger(units * 512000)) add(label!, units * 512000, "bytes");
  }
  if (Array.isArray(data?.ata_smart_attributes?.table)) {
    result.attributes = data.ata_smart_attributes.table.filter((a) => numeric(a?.id) !== null).map((a) => ({
      id: a.id, name: typeof a.name === "string" ? a.name : "Unknown attribute",
      value: numeric(a.value), worst: numeric(a.worst), threshold: numeric(a.thresh),
      raw: typeof a.raw?.string === "string" ? a.raw.string : String(numeric(a.raw?.value) ?? "Not reported"),
      failed: typeof a.when_failed === "string" ? a.when_failed : "",
    }));
  }
  const status = numeric(data?.smartctl?.exit_status) ?? 0;
  if (status & 7) result.reason = status & 2
    ? "The drive could not be opened or identified. Access permissions or the storage adapter may block SMART."
    : "Some SMART commands failed or are unsupported. Available readings are shown.";
  if (!result.reason && !result.metrics.length && !result.attributes.length) result.reason = "Detailed SMART data is not exposed by this drive or storage adapter.";
  return result;
}

export function smartctlLocation(
  platform: string = process.platform,
  arch: string = process.arch,
  resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath,
  compiledDirectory = __dirname,
): { executable: string; database?: string; bundled: boolean } {
  const packaged = compiledDirectory.includes("app.asar") && resources;
  const directory = packaged ? join(resources, "smartmontools")
    : join(compiledDirectory, "..", "native", "smartmontools", "publish", `${platform}-${arch}`);
  const binary = join(directory, platform === "win32" ? "smartctl.exe" : "smartctl");
  if ((platform === "darwin" || platform === "win32") && (packaged || existsSync(binary))) {
    return { executable: binary, database: join(directory, "drivedb.h"), bundled: true };
  }
  const candidates = platform === "win32"
    ? [join(process.env.ProgramFiles || "C:\\Program Files", "smartmontools", "bin", "smartctl.exe")]
    : ["/opt/homebrew/bin/smartctl", "/usr/local/sbin/smartctl", "/usr/local/bin/smartctl", "/usr/sbin/smartctl"];
  return { executable: candidates.find(existsSync) || "smartctl", bundled: false };
}

export async function readStorageHealth(device: string, existing?: unknown): Promise<StorageHealth> {
  const location = smartctlLocation();
  if (existing && !location.bundled) {
    const parsed = parseStorageHealth(existing);
    if (parsed.metrics.length || parsed.attributes.length) return parsed;
  }
  if (/^disk\d+$/.test(device)) device = `/dev/${device}`;
  const empty = (reason: string): StorageHealth => ({ checkedAt: Date.now(), passed: null, metrics: [], attributes: [], reason });
  // Device identifiers only originate from OS disk discovery, never shell interpolation.
  if (!/^(\/dev\/[a-zA-Z0-9_./-]+|\\\\\.\\PhysicalDrive\d+)$/i.test(device)) return empty("No supported physical-device path was reported for this drive.");
  return new Promise((resolve) => {
    execFile(location.executable, ["-a", "-j", ...(location.database ? ["-B", location.database] : []), device], { timeout: 10000, maxBuffer: 2 * 1024 * 1024, windowsHide: true }, (error, stdout) => {
      // smartctl uses nonzero exit bits for drive warnings too; preserve valid JSON.
      try {
        const data = JSON.parse(stdout);
        if (data && typeof data === "object" && !Array.isArray(data)) { resolve(parseStorageHealth(data)); return; }
      } catch { /* Explain collection failure below. */ }
      const code = (error as NodeJS.ErrnoException | null)?.code;
      resolve(empty(code === "ENOENT"
        ? location.bundled ? "The bundled SMART tool is missing. Download the app again to restore storage health."
          : "SMART tool unavailable. For a development checkout, run npm run build:smartmontools, then refresh storage health."
        : code === "EACCES" || code === "EPERM"
          ? "Permission denied while reading SMART. Administrator access may be required."
          : error?.killed ? "SMART query timed out. Refresh storage health to retry."
            : "SMART returned no readable data. The drive, adapter or access permissions may not support it."));
    });
  });
}
