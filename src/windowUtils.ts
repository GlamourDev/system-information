import fs from "node:fs";
import path from "node:path";

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface DisplayArea {
  id: number;
  workArea: Bounds;
}
interface WindowState {
  bounds?: Bounds;
  maximized?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validBounds(bounds: unknown): bounds is Bounds {
  return (
    isRecord(bounds) &&
    ["x", "y", "width", "height"].every((key) => Number.isFinite(bounds[key])) &&
    typeof bounds.width === "number" &&
    bounds.width > 0 &&
    typeof bounds.height === "number" &&
    bounds.height > 0
  );
}

export function fitBounds(saved: unknown, displays: DisplayArea[], primaryId: number) {
  const primary = displays.find((display) => display.id === primaryId) || displays[0];
  if (!primary) throw new Error("No displays available");
  const bounds = validBounds(saved) ? saved : null;
  let target = primary;
  let bestArea = 0;
  if (bounds) {
    for (const display of displays) {
      const area = display.workArea;
      const overlap =
        Math.max(
          0,
          Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x),
        ) *
        Math.max(
          0,
          Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y),
        );
      if (overlap > bestArea) {
        bestArea = overlap;
        target = display;
      }
    }
  }
  const area = target.workArea;
  const minWidth = Math.min(900, area.width);
  const minHeight = Math.min(640, area.height);
  const width = Math.round(Math.max(minWidth, Math.min(bounds?.width || 1180, area.width)));
  const height = Math.round(Math.max(minHeight, Math.min(bounds?.height || 790, area.height)));
  const center = !bounds || bestArea === 0;
  const x = Math.round(
    center
      ? area.x + (area.width - width) / 2
      : Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
  );
  const y = Math.round(
    center
      ? area.y + (area.height - height) / 2
      : Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
  );
  return { x, y, width, height, minWidth, minHeight };
}

export function readWindowState(file: string): WindowState {
  try {
    const saved: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    return isRecord(saved) && validBounds(saved.bounds)
      ? { bounds: saved.bounds, maximized: saved.maximized === true }
      : {};
  } catch {
    return {};
  }
}

export function writeWindowState(file: string, state: WindowState) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(state, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  } catch (error) {
    console.warn(
      "Could not save window placement:",
      error instanceof Error ? error.message : String(error),
    );
  }
}
