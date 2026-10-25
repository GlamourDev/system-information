import { Tray, Menu, nativeImage } from "electron";
import path from "node:path";
import { APP_INFO } from "./appInfo.js";
import type { HardwareSample, MonitorSettings, SampleInterval } from "./types.js";

interface TrayActions {
  open: () => void;
  about: () => void;
  setPaused: (value: boolean) => boolean;
  setInterval: (value: SampleInterval) => SampleInterval;
  quit: () => void;
}

interface TrayState extends MonitorSettings {
  sample: HardwareSample | null;
}

const gb = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? (value / 1024 ** 3).toFixed(1) : "—";

export function createMonitorTray({ open, about, setPaused, setInterval, quit }: TrayActions) {
  const icon = nativeImage.createFromPath(
    path.join(
      __dirname,
      "..",
      "assets",
      "icons",
      process.platform === "darwin"
        ? "statusTemplate.png"
        : process.platform === "win32"
          ? "status.ico"
          : "status.png",
    ),
  );
  const tray = new Tray(icon);
  const menu = Menu.buildFromTemplate([
    { label: `Open ${APP_INFO.name}`, click: open },
    { type: "separator" },
    { id: "cpu", label: "CPU    Reading…", enabled: false },
    { id: "memory", label: "Memory    Reading…", enabled: false },
    { type: "separator" },
    {
      id: "pause",
      label: "Pause monitoring",
      type: "checkbox",
      click: (item) => setPaused(item.checked),
    },
    {
      label: "Update interval",
      submenu: ([1000, 2000, 5000] as const).map((value) => ({
        id: `interval-${value}`,
        label: `${value / 1000} second${value === 1000 ? "" : "s"}`,
        type: "radio" as const,
        checked: value === 2000,
        click: () => setInterval(value),
      })),
    },
    { type: "separator" },
    { label: `About ${APP_INFO.name}`, click: about },
    { type: "separator" },
    { label: `Quit ${APP_INFO.name}`, click: quit },
  ]);
  tray.setToolTip(`${APP_INFO.name} — reading sensors`);
  tray.setContextMenu(menu);
  if (process.platform !== "darwin") tray.on("click", open);
  if (process.platform !== "linux") tray.on("double-click", open);

  function update({ sample, paused, interval }: TrayState) {
    if (tray.isDestroyed()) return;
    const cpu = sample?.currentLoad?.currentLoad;
    const cpuText = typeof cpu === "number" && Number.isFinite(cpu) ? `${cpu.toFixed(0)}%` : "—";
    const mem = sample?.mem;
    const used =
      mem &&
      (Number.isFinite(mem.active)
        ? mem.active
        : Number.isFinite(mem.available)
          ? mem.total - mem.available
          : mem.used);
    const memoryText = mem ? `${gb(used)} / ${gb(mem.total)} GB` : "—";
    menu.getMenuItemById("cpu")!.label = `CPU    ${cpuText}`;
    menu.getMenuItemById("memory")!.label = `Memory    ${memoryText}`;
    menu.getMenuItemById("pause")!.checked = paused;
    for (const value of [1000, 2000, 5000])
      menu.getMenuItemById(`interval-${value}`)!.checked = value === interval;
    tray.setToolTip(
      `${APP_INFO.name}${paused ? " — paused" : ""}\nCPU ${cpuText}\nMemory ${memoryText}`,
    );
    if (process.platform === "darwin")
      tray.setTitle(paused ? "Paused" : `CPU ${cpuText}`, {
        fontType: "monospacedDigit",
      });
    if (process.platform === "linux") tray.setContextMenu(menu);
  }

  return {
    update,
    destroy: () => {
      if (!tray.isDestroyed()) tray.destroy();
    },
  };
}
