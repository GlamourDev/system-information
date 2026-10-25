import { app, BrowserWindow, ipcMain, nativeTheme, Menu, clipboard, screen } from "electron";
import path from "node:path";
import { APP_INFO, APP_ID } from "./appInfo.js";
import { release } from "node:os";
import { getWindowAppearance, getCloseAction, getCloseLabel } from "./platform.js";
import type { MenuItemConstructorOptions } from "electron";
import * as collector from "./machineInfo.js";
import { createMonitorTray } from "./trayMenu.js";
import { fitBounds, readWindowState, writeWindowState } from "./windowUtils.js";
import type {
  BootstrapData,
  HardwareEvents,
  HardwareInventory,
  HardwareSample,
  SampleInterval,
} from "./types.js";

app.setName(APP_INFO.name);
app.setPath("userData", path.join(app.getPath("appData"), "Hardware Monitor"));
nativeTheme.themeSource = "system";
if (process.platform === "win32") app.setAppUserModelId(APP_ID);

const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();

const stateFile = path.join(app.getPath("userData"), "window-state.json");
let window: BrowserWindow | null = null;
let tray: ReturnType<typeof createMonitorTray> | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let placementTimer: ReturnType<typeof setTimeout> | undefined;
let initialization: Promise<void> | undefined;
let quitting = false;
let sampling = false;
let paused = false;
let interval: SampleInterval = 2000;
let lastSample: HardwareSample | null = null;
let hardware: HardwareInventory | null = null;
let lastVolumes = 0;

function send<K extends keyof HardwareEvents>(channel: K, data: HardwareEvents[K]) {
  if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
    window.webContents.send(channel, data);
}

function updateTray() {
  tray?.update({ sample: lastSample, paused, interval });
}

async function tick() {
  if (sampling || paused || quitting) return;
  sampling = true;
  try {
    const sample = await collector.sample();
    if (paused || quitting) return;
    lastSample = sample;
    updateTray();
    send("hardware:sample", lastSample);
    if (hardware && Date.now() - lastVolumes > 30000) {
      hardware.fsSize = await collector.volumes();
      lastVolumes = Date.now();
      if (!quitting) send("hardware:inventory", hardware);
    }
  } catch (error) {
    console.error(
      "Could not update hardware readings:",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    sampling = false;
  }
}

function schedule() {
  clearInterval(timer);
  if (!paused && !quitting) timer = setInterval(tick, interval);
}

function setPaused(value: unknown) {
  paused = Boolean(value);
  schedule();
  updateTray();
  send("hardware:settings", { paused, interval });
  if (!paused) tick();
  return paused;
}

function setIntervalValue(value: unknown) {
  if (value === 1000 || value === 2000 || value === 5000) interval = value;
  schedule();
  updateTray();
  send("hardware:settings", { paused, interval });
  return interval;
}

function savePlacement() {
  clearTimeout(placementTimer);
  if (!window || window.isDestroyed() || window.isMinimized() || window.isFullScreen()) return;
  writeWindowState(stateFile, {
    bounds: window.getNormalBounds(),
    maximized: window.isMaximized(),
  });
}

function queuePlacementSave() {
  clearTimeout(placementTimer);
  placementTimer = setTimeout(savePlacement, 250);
}

function ensureVisiblePlacement() {
  if (!window || window.isDestroyed() || window.isFullScreen()) return;
  const current = window.getNormalBounds();
  const fitted = fitBounds(current, screen.getAllDisplays(), screen.getPrimaryDisplay().id);
  window.setMinimumSize(fitted.minWidth, fitted.minHeight);
  if (
    !window.isMaximized() &&
    (["x", "y", "width", "height"] as const).some((key) => current[key] !== fitted[key])
  ) {
    const { x, y, width, height } = fitted;
    window.setBounds({ x, y, width, height });
  }
}

function showWindow() {
  if (!window || window.isDestroyed()) {
    createWindow();
    return;
  }
  if (window.isMinimized()) window.restore();
  ensureVisiblePlacement();
  window.show();
  window.focus();
}

function updateWindowTheme() {
  if (!window || window.isDestroyed() || process.platform === "darwin") return;
  const appearance = getWindowAppearance(process.platform, release(), nativeTheme.shouldUseDarkColors);
  if (appearance.backgroundColor) window.setBackgroundColor(appearance.backgroundColor);
  if (process.platform === "win32" && typeof appearance.titleBarOverlay === "object") {
    window.setTitleBarOverlay(appearance.titleBarOverlay);
  }
}

function createWindow() {
  const saved = readWindowState(stateFile);
  const fitted = fitBounds(saved.bounds, screen.getAllDisplays(), screen.getPrimaryDisplay().id);
  const client = new BrowserWindow({
    ...fitted,
    title: APP_INFO.name,
    ...getWindowAppearance(process.platform, release(), nativeTheme.shouldUseDarkColors),
    icon: path.join(
      __dirname,
      "..",
      "assets",
      "icons",
      process.platform === "win32" ? "app.ico" : "app.png",
    ),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window = client;
  client.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  client.webContents.on("will-navigate", (event) => event.preventDefault());
  client.once("ready-to-show", () => {
    if (saved.maximized) client.maximize();
    client.show();
  });
  client.on("move", queuePlacementSave);
  client.on("resize", queuePlacementSave);
  client.on("maximize", queuePlacementSave);
  client.on("unmaximize", queuePlacementSave);
  client.on("close", (event) => {
    savePlacement();
    if (quitting) return;
    const action = getCloseAction(process.platform, Boolean(tray));
    if (action === "quit") return;
    event.preventDefault();
    if (action === "minimize") client.minimize();
    else client.hide();
  });
  client.on("closed", () => {
    window = null;
  });
  client.loadFile(path.join(__dirname, "web", "index.html"));
}

ipcMain.handle("hardware:bootstrap", async (): Promise<BootstrapData> => {
  await initialization;
  if (!hardware) throw new Error("Hardware initialization failed");
  return { hardware, sample: lastSample, paused, interval };
});
ipcMain.handle("hardware:pause", (_, value: unknown) => setPaused(value));
ipcMain.handle("hardware:interval", (_, value: unknown) => setIntervalValue(value));
ipcMain.handle("hardware:copy", (_, report: unknown) => {
  if (typeof report === "string" && report.length < 100000) clipboard.writeText(report);
});

app.whenReady().then(() => {
  if (!primaryInstance) return;
  const mac = process.platform === "darwin";
  app.setAboutPanelOptions({
    applicationName: APP_INFO.name,
    applicationVersion: APP_INFO.version,
    version: "",
    copyright: APP_INFO.copyright,
    credits: APP_INFO.description,
    iconPath: path.join(__dirname, "..", "assets", "icons", mac ? "about-mac.png" : "about.png"),
  });
  if (mac) app.dock?.setIcon(path.join(__dirname, "..", "assets", "icons", "app-mac.png"));
  const showAbout = () => {
    showWindow();
    app.showAboutPanel();
  };
  try {
    tray = createMonitorTray({
      open: showWindow,
      about: showAbout,
      setPaused,
      setInterval: setIntervalValue,
      quit: () => app.quit(),
    });
  } catch (error) {
    console.warn("Tray unavailable:", error instanceof Error ? error.message : String(error));
  }
  const applicationItems: MenuItemConstructorOptions[] = [
    ...(mac
      ? [{ label: `About ${APP_INFO.name}`, click: showAbout }, { type: "separator" as const }]
      : []),
    { label: `Open ${APP_INFO.name}`, click: showWindow },
    ...(mac ? [{ role: "hide" as const }, { role: "hideOthers" as const }] : []),
    { type: "separator" },
    {
      label: `Quit ${APP_INFO.name}`,
      accelerator: "CommandOrControl+Q",
      click: () => app.quit(),
    },
  ];
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { label: mac ? APP_INFO.name : "File", submenu: applicationItems },
      { role: "editMenu" },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { role: "togglefullscreen" },
        ],
      },
      ...(!mac
        ? [
            {
              label: "Help",
              submenu: [{ label: `About ${APP_INFO.name}`, click: showAbout }],
            },
          ]
        : []),
      {
        label: "Window",
        submenu: [
          { role: "minimize" },
          { role: "zoom" },
          {
            label: getCloseLabel(process.platform, Boolean(tray)),
            accelerator: "CommandOrControl+W",
            click: () => window?.close(),
          },
          { type: "separator" },
          { label: `Open ${APP_INFO.name}`, click: showWindow },
        ],
      },
    ]),
  );
  updateTray();
  createWindow();
  initialization = (async () => {
    hardware = await collector.inventory();
    lastVolumes = Date.now();
    send("hardware:inventory", hardware);
    await tick();
    schedule();
  })();
  app.on("activate", showWindow);
  nativeTheme.on("updated", updateWindowTheme);
  screen.on("display-removed", ensureVisiblePlacement);
  screen.on("display-metrics-changed", ensureVisiblePlacement);
  screen.on("display-added", ensureVisiblePlacement);
});
app.on("second-instance", () => {
  if (app.isReady()) showWindow();
});
app.on("before-quit", () => {
  quitting = true;
  clearInterval(timer);
  savePlacement();
});
app.on("will-quit", () => {
  nativeTheme.removeListener("updated", updateWindowTheme);
  clearTimeout(placementTimer);
  tray?.destroy();
});
app.on("window-all-closed", () => {
  if (!tray) app.quit();
});
