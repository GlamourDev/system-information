import type { Systeminformation as SI } from "systeminformation";
import type { MonitorView, TableRow } from "../model/types.js";
import { positive } from "../lib/format.js";
import { renderSection } from "../components/table.js";

function renderController(controller: SI.GraphicsControllerData, index: number): string {
  const memory = controller.vramDynamic
    ? "Shared system memory"
    : positive(controller.vram)
      ? `${controller.vram} MB`
      : null;
  const rows: TableRow[] = [
    ["Vendor", controller.vendor],
    ["Model", controller.model],
    ["Bus", controller.bus],
    ["Cores", controller.cores],
    ["Memory", memory],
    ["Driver", controller.driverVersion],
  ];

  return renderSection(controller.model || `Graphics ${index + 1}`, rows, `GPU ${index}`);
}

function renderDisplay(display: SI.GraphicsDisplayData, index: number): string {
  const resolution =
    display.resolutionX && display.resolutionY
      ? `${display.resolutionX} × ${display.resolutionY}`
      : null;
  const rows: TableRow[] = [
    ["Connection", display.connection],
    ["Resolution", resolution],
    [
      "Refresh rate",
      positive(display.currentRefreshRate) ? `${display.currentRefreshRate} Hz` : null,
    ],
    ["Built-in", display.builtin === undefined ? null : display.builtin ? "Yes" : "No"],
    ["Main display", display.main === undefined ? null : display.main ? "Yes" : "No"],
    ["Pixel depth", display.pixelDepth ? `${display.pixelDepth}-bit` : null],
  ];

  return renderSection(display.model || `Display ${index + 1}`, rows, `Display ${index + 1}`);
}

export function renderGraphics(view: MonitorView): string {
  const controllers = view.hardware.graphics?.controllers ?? [];
  const displays = view.hardware.graphics?.displays ?? [];
  if (!controllers.length && !displays.length) {
    return '<div class="empty-state">Graphics information is unavailable</div>';
  }

  return [...controllers.map(renderController), ...displays.map(renderDisplay)].join("\n");
}
