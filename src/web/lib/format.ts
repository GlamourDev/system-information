import type { SensorUnit } from "../model/types.js";

const byteUnits = ["B", "KB", "MB", "GB", "TB"] as const;

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function positive(value: unknown): number | null {
  return isFiniteNumber(value) && value > 0 ? value : null;
}

export function nonnegative(value: unknown): number | null {
  return isFiniteNumber(value) && value >= 0 ? value : null;
}

export function formatNumber(value: unknown, digits = 1): string {
  if (!isFiniteNumber(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatBytes(value: unknown, digits = 1): string {
  if (!isFiniteNumber(value) || value < 0) return "—";
  if (value === 0) return "0 B";

  const unit = Math.max(
    0,
    Math.min(Math.floor(Math.log(value) / Math.log(1024)), byteUnits.length - 1),
  );
  const precision = unit === 0 && value >= 1 ? 0 : digits;
  return `${formatNumber(value / 1024 ** unit, precision)} ${byteUnits[unit]}`;
}

export function formatDuration(seconds: unknown): string {
  if (!isFiniteNumber(seconds) || seconds < 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor(seconds / 60) % 60;
  return `${days ? `${days}d ` : ""}${hours}h ${minutes}m`;
}

export function formatSensor(value: unknown, unit: SensorUnit): string {
  if (!isFiniteNumber(value)) return "—";
  if (unit === "bytes") return formatBytes(value);
  if (unit === "rate") return value < 0 ? "—" : `${formatBytes(value)}/s`;
  return `${formatNumber(value, unit === "rpm" ? 0 : 1)} ${unit}`;
}
