const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function boot({
  platform = "darwin",
  trayAvailable = true,
  installerValid = true,
  dark = true,
  release = platform === "win32" ? "10.0.26100" : "25.0.0",
} = {}) {
  const app = new EventEmitter();
  let appUserModelId;
  let aboutOptions;
  let aboutShown = 0;
  let dockIcon;
  let applicationMenu;
  let quitRequested = false;
  Object.assign(app, {
    setName() {},
    setAboutPanelOptions(options) {
      aboutOptions = options;
    },
    showAboutPanel() {
      aboutShown++;
    },
    dock: {
      setIcon(value) {
        dockIcon = value;
      },
    },
    setPath() {},
    setAppUserModelId(value) {
      appUserModelId = value;
    },
    getPath: () => "/tmp/hardware-test",
    requestSingleInstanceLock: () => true,
    whenReady: async () => {},
    isReady: () => true,
  });
  const windows = [];
  const messages = [];
  const intervals = new Map();
  const handlers = new Map();
  const saved = [];
  const trayUpdates = [];
  let trayActions;
  let trayDestroyed = false;
  let samples = 0;
  let sensorStops = 0;
  const installers = [];
  let nextTimer = 0;

  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.backgroundColor = options.backgroundColor;
      this.titleBarOverlay = options.titleBarOverlay;
      this.backgroundUpdates = [];
      this.overlayUpdates = [];
      this.bounds = {
        x: options.x,
        y: options.y,
        width: options.width,
        height: options.height,
      };
      this.visible = false;
      this.destroyed = false;
      this.minimized = false;
      this.webContents = new EventEmitter();
      this.webContents.isDestroyed = () => false;
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.send = (channel, value) => messages.push({ channel, value });
      windows.push(this);
    }
    loadFile() {
      queueMicrotask(() => this.emit("ready-to-show"));
    }
    show() {
      this.visible = true;
    }
    hide() {
      this.visible = false;
    }
    focus() {
      this.focused = true;
    }
    minimize() {
      this.minimized = true;
      this.visible = false;
    }
    restore() {
      this.minimized = false;
      this.visible = true;
    }
    isDestroyed() {
      return this.destroyed;
    }
    isMinimized() {
      return this.minimized;
    }
    isFullScreen() {
      return false;
    }
    isMaximized() {
      return false;
    }
    getNormalBounds() {
      return this.bounds;
    }
    setBackgroundColor(color) {
      this.backgroundColor = color;
      this.backgroundUpdates.push(color);
    }
    setTitleBarOverlay(options) {
      this.titleBarOverlay = options;
      this.overlayUpdates.push(options);
    }
    setMinimumSize() {}
    setBounds(bounds) {
      this.bounds = bounds;
    }
    close() {
      if (this.destroyed) return;
      const event = {
        prevented: false,
        preventDefault() {
          this.prevented = true;
        },
      };
      this.emit("close", event);
      if (!event.prevented) {
        this.destroyed = true;
        this.emit("closed");
        if (windows.every((window) => window.destroyed)) app.emit("window-all-closed");
      }
    }
  }

  app.quit = () => {
    if (quitRequested) return;
    quitRequested = true;
    app.emit("before-quit");
    for (const window of windows) window.close();
    app.emit("will-quit");
  };
  const screen = new EventEmitter();
  screen.getAllDisplays = () => [{ id: 1, workArea: { x: 0, y: 25, width: 1440, height: 875 } }];
  screen.getPrimaryDisplay = () => ({ id: 1 });
  const nativeTheme = new EventEmitter();
  nativeTheme.shouldUseDarkColors = dark;
  const electron = {
    app,
    BrowserWindow: Window,
    screen,
    nativeTheme,
    clipboard: { writeText() {} },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    Menu: {
      buildFromTemplate: (template) => template,
      setApplicationMenu(value) {
        applicationMenu = value;
      },
    },
  };
  const windowState = require("../dist/windowUtils.js");
  const mocks = {
    electron: { ...electron, shell: { openPath: async (file) => { installers.push(file); return ""; } } },
    "node:fs/promises": { readFile: async () => Buffer.from("installer") },
    "node:crypto": { createHash: () => ({ update: () => ({ digest: () => installerValid ? "a3a46226c5e2824f4cdd42be0eecbabfc672c86f7889710f5ab1e6ad385b47a0" : "wrong" }) }) },
    "./sensorProviders.js": { windowsSensorDirectory: () => "/test/sensors" },
    "node:path": path,
    "node:os": { release: () => release },
    "./platform.js": require("../dist/platform.js"),
    "./appInfo.js": require("../dist/appInfo.js"),
    "./machineInfo.js": {
      stopSensors: () => { sensorStops++; },
      inventory: async () => ({ cpu: { brand: "Test CPU" }, fsSize: [] }),
      sample: async () => ({
        at: ++samples,
        currentLoad: { currentLoad: samples },
        mem: { total: 100, active: 50 },
      }),
      volumes: async () => [],
    },
    "./windowUtils.js": {
      ...windowState,
      readWindowState: () => ({
        bounds: { x: 80, y: 90, width: 1000, height: 700 },
      }),
      writeWindowState: (_, data) => saved.push(data),
    },
    "./trayMenu.js": {
      createMonitorTray: (actions) => {
        if (!trayAvailable) throw new Error("Tray unavailable");
        trayActions = actions;
        return {
          update: (data) => trayUpdates.push(data),
          destroy: () => {
            trayDestroyed = true;
          },
        };
      },
    },
  };
  const context = vm.createContext({
    module: { exports: {} },
    exports: {},
    require: (name) => {
      if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`);
      return mocks[name];
    },
    __dirname: path.resolve(__dirname, "../dist"),
    process: { platform },
    console: { ...console, warn() {} },
    setInterval: (callback) => {
      const id = ++nextTimer;
      intervals.set(id, callback);
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
    setTimeout: () => ++nextTimer,
    clearTimeout() {},
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../dist/app-entry.js"), "utf8"), context);
  await new Promise((resolve) => setImmediate(resolve));
  return {
    app,
    installers,
    get sensorStops() { return sensorStops; },
    nativeTheme,
    applicationMenu,
    aboutOptions,
    aboutShown: () => aboutShown,
    dockIcon,
    appUserModelId,
    quitRequested: () => quitRequested,
    window: windows[0],
    messages,
    intervals,
    handlers,
    saved,
    trayUpdates,
    trayActions,
    samples: () => samples,
    trayDestroyed: () => trayDestroyed,
  };
}

test("close hides the window while sampling and tray updates continue", async () => {
  const fixture = await boot();
  assert.equal(fixture.window.options.x, 80);
  assert.equal(fixture.window.options.width, 1000);
  fixture.window.close();
  assert.equal(fixture.window.visible, false);
  assert.equal(fixture.window.destroyed, false);
  const previous = fixture.samples();
  await [...fixture.intervals.values()][0]();
  assert.equal(fixture.samples(), previous + 1);
  assert.equal(fixture.trayUpdates.at(-1).sample.at, fixture.samples());
  fixture.trayActions.open();
  assert.equal(fixture.window.visible, true);
  assert.equal(fixture.window.focused, true);
});

test("tray settings synchronize with the renderer and pause the sampler", async () => {
  const fixture = await boot();
  fixture.trayActions.setPaused(true);
  assert.equal(fixture.intervals.size, 0);
  assert.equal(fixture.trayUpdates.at(-1).paused, true);
  const settings = fixture.messages.filter((item) => item.channel === "hardware:settings").at(-1);
  assert.equal(settings.value.paused, true);
  fixture.trayActions.setInterval(5000);
  assert.equal(fixture.trayUpdates.at(-1).interval, 5000);
  assert.equal(fixture.intervals.size, 0);
  fixture.trayActions.setPaused(false);
  assert.equal(fixture.intervals.size, 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.trayUpdates.at(-1).paused, false);
});

test("explicit quit closes the window, saves placement and removes the tray", async () => {
  const fixture = await boot();
  fixture.trayActions.quit();
  assert.equal(fixture.window.destroyed, true);
  assert.equal(fixture.intervals.size, 0);
  assert.equal(fixture.saved.at(-1).bounds.x, 80);
  assert.equal(fixture.saved.at(-1).bounds.width, 1000);
  assert.equal(fixture.trayDestroyed(), true);
});

function menuItems(items) {
  return items.flatMap((item) => [
    item,
    ...menuItems(Array.isArray(item.submenu) ? item.submenu : []),
  ]);
}

test("Windows keeps native caption controls and close hides to tray", async () => {
  const fixture = await boot({ platform: "win32" });
  assert.equal(fixture.window.options.titleBarStyle, "hidden");
  assert.equal(fixture.window.options.titleBarOverlay.height, 44);
  assert.equal(fixture.window.options.trafficLightPosition, undefined);
  assert.equal(fixture.window.options.vibrancy, undefined);
  assert.ok(fixture.appUserModelId);
  const quit = menuItems(fixture.applicationMenu).find(
    (item) => item.label === "Quit System Information",
  );
  assert.ok(quit);
  assert.notEqual(String(quit.accelerator || "").toLowerCase(), "alt+f4");
  fixture.window.close();
  assert.equal(fixture.window.visible, false);
  assert.equal(fixture.window.destroyed, false);
  assert.equal(fixture.quitRequested(), false);
  fixture.trayActions.open();
  assert.equal(fixture.window.visible, true);
});

test("Linux minimizes on close and can be restored through the tray", async () => {
  const fixture = await boot({ platform: "linux" });
  assert.equal(fixture.window.options.titleBarStyle, "default");
  assert.equal(fixture.window.options.titleBarOverlay, undefined);
  assert.equal(fixture.window.options.vibrancy, undefined);
  assert.equal(fixture.window.options.backgroundMaterial, undefined);
  const items = menuItems(fixture.applicationMenu);
  assert.ok(items.some((item) => item.label === "Minimize to Taskbar"));
  assert.ok(!items.some((item) => item.label === "Close to Menu Bar"));
  fixture.window.close();
  assert.equal(fixture.window.minimized, true);
  assert.equal(fixture.window.destroyed, false);
  assert.equal(fixture.quitRequested(), false);
  const previous = fixture.samples();
  await [...fixture.intervals.values()][0]();
  assert.equal(fixture.samples(), previous + 1);
  fixture.trayActions.open();
  assert.equal(fixture.window.minimized, false);
  assert.equal(fixture.window.visible, true);
  assert.equal(fixture.window.focused, true);
});

for (const platform of ["darwin", "win32", "linux"]) {
  test(`${platform} starts and quits normally when tray creation fails`, async () => {
    const fixture = await boot({ platform, trayAvailable: false });
    assert.ok(fixture.window);
    assert.equal(fixture.window.visible, true);
    assert.ok(menuItems(fixture.applicationMenu).some((item) => item.label === "Close"));
    fixture.window.close();
    assert.equal(fixture.window.destroyed, true);
    assert.equal(fixture.window.minimized, false);
    assert.equal(fixture.quitRequested(), true);
    assert.equal(fixture.intervals.size, 0);
    assert.ok(fixture.saved.length > 0);
  });
}

test("older Windows builds use the solid material fallback", async () => {
  const fixture = await boot({ platform: "win32", release: "10.0.19045" });
  assert.equal(fixture.window.options.backgroundColor, "#171b20");
  assert.equal(fixture.window.options.backgroundMaterial, undefined);
  assert.equal(fixture.window.options.transparent, false);
  assert.equal(fixture.window.options.titleBarOverlay.height, 44);
});

for (const platform of ["darwin", "win32", "linux"]) {
  test(`${platform} About shows the application identity and version`, async () => {
    const fixture = await boot({ platform });
    assert.equal(fixture.aboutOptions.applicationName, "System Information");
    assert.equal(fixture.aboutOptions.applicationVersion, require("../package.json").version);
    assert.ok(fixture.aboutOptions.credits.length > 0);
    assert.equal(
      path.basename(fixture.aboutOptions.iconPath),
      platform === "darwin" ? "about-mac.png" : "about.png",
    );
    const about = menuItems(fixture.applicationMenu).find(
      (item) => item.label === "About System Information",
    );
    assert.ok(about);
    about.click();
    assert.equal(fixture.aboutShown(), 1);
    fixture.trayActions.about();
    assert.equal(fixture.aboutShown(), 2);
    if (platform === "darwin") assert.equal(path.basename(fixture.dockIcon), "app-mac.png");
    else assert.equal(fixture.dockIcon, undefined);
  });
}

for (const platform of ["darwin", "win32", "linux"]) {
  test(`${platform} follows the system theme at startup`, async () => {
    const fixture = await boot({ platform, dark: false });
    assert.equal(fixture.nativeTheme.themeSource, "system");
    if (platform === "win32") {
      assert.equal(fixture.window.options.titleBarOverlay.color, "#f4f6f8");
      assert.equal(fixture.window.options.titleBarOverlay.symbolColor, "#303a43");
      assert.equal(fixture.window.options.backgroundColor, "#00000000");
    } else if (platform === "linux") {
      assert.equal(fixture.window.options.backgroundColor, "#f4f6f8");
    } else {
      assert.equal(fixture.window.options.backgroundColor, "#00000000");
      assert.equal(fixture.window.options.vibrancy, "under-window");
    }
  });
}

test("Windows caption controls update with the system theme without changing acrylic", async () => {
  const fixture = await boot({ platform: "win32", dark: false });
  fixture.nativeTheme.shouldUseDarkColors = true;
  fixture.nativeTheme.emit("updated");
  assert.equal(fixture.window.titleBarOverlay.color, "#171b20");
  assert.equal(fixture.window.titleBarOverlay.symbolColor, "#d3d8df");
  assert.equal(fixture.window.titleBarOverlay.height, 44);
  assert.equal(fixture.window.backgroundColor, "#00000000");
  fixture.nativeTheme.shouldUseDarkColors = false;
  fixture.nativeTheme.emit("updated");
  assert.equal(fixture.window.titleBarOverlay.color, "#f4f6f8");
  assert.equal(fixture.window.titleBarOverlay.symbolColor, "#303a43");
});

test("Windows solid fallback updates its background alongside the caption controls", async () => {
  const fixture = await boot({ platform: "win32", release: "10.0.19045", dark: false });
  assert.equal(fixture.window.options.backgroundColor, "#f4f6f8");
  fixture.nativeTheme.shouldUseDarkColors = true;
  fixture.nativeTheme.emit("updated");
  assert.equal(fixture.window.backgroundColor, "#171b20");
  assert.equal(fixture.window.titleBarOverlay.color, "#171b20");
  assert.equal(fixture.window.options.backgroundMaterial, undefined);
});

test("Linux solid background follows system theme changes without caption overlays", async () => {
  const fixture = await boot({ platform: "linux", dark: false });
  fixture.nativeTheme.shouldUseDarkColors = true;
  fixture.nativeTheme.emit("updated");
  assert.equal(fixture.window.backgroundColor, "#171b20");
  fixture.nativeTheme.shouldUseDarkColors = false;
  fixture.nativeTheme.emit("updated");
  assert.equal(fixture.window.backgroundColor, "#f4f6f8");
  assert.equal(fixture.window.overlayUpdates.length, 0);
});

test("macOS leaves transparent vibrancy under system control on theme changes", async () => {
  const fixture = await boot({ platform: "darwin", dark: false });
  fixture.nativeTheme.shouldUseDarkColors = true;
  fixture.nativeTheme.emit("updated");
  assert.equal(fixture.window.backgroundColor, "#00000000");
  assert.equal(fixture.window.backgroundUpdates.length, 0);
  assert.equal(fixture.window.overlayUpdates.length, 0);
});


test("Windows sensor driver setup only launches on explicit request and verifies its hash", async () => {
  const fixture = await boot({ platform: "win32" });
  assert.equal(fixture.installers.length, 0);
  await fixture.handlers.get("hardware:setup-sensors")();
  assert.equal(fixture.installers.length, 1);
  assert.match(fixture.installers[0], /PawnIO_setup\.exe$/);
  const corrupt = await boot({ platform: "win32", installerValid: false });
  await assert.rejects(corrupt.handlers.get("hardware:setup-sensors")(), /verification failed/);
  assert.equal(corrupt.installers.length, 0);
});

test("retry and quitting release the persistent sensor helper", async () => {
  const fixture = await boot();
  await fixture.handlers.get("hardware:retry-sensors")();
  assert.equal(fixture.sensorStops, 1);
  fixture.app.emit("before-quit");
  assert.equal(fixture.sensorStops, 2);
});
