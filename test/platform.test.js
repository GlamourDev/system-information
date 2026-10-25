const { test } = require("node:test");
const assert = require("node:assert/strict");
const { getWindowAppearance, getCloseAction, getCloseLabel } = require("../dist/platform.js");

test("macOS uses inset traffic lights and native vibrancy", () => {
  const options = getWindowAppearance("darwin", "25.0.0");
  assert.equal(options.titleBarStyle, "hiddenInset");
  assert.deepEqual(options.trafficLightPosition, { x: 20, y: 14 });
  assert.equal(options.transparent, true);
  assert.equal(options.vibrancy, "under-window");
  assert.equal(options.visualEffectState, "active");
  assert.equal(options.backgroundColor, "#00000000");
  assert.equal(options.titleBarOverlay, undefined);
  assert.equal(options.backgroundMaterial, undefined);
});

test("supported Windows builds retain native caption buttons and use acrylic", () => {
  for (const release of ["10.0.22621", "10.0.26100", "11.0.0"]) {
    const options = getWindowAppearance("win32", release);
    assert.equal(options.titleBarStyle, "hidden");
    assert.deepEqual(options.titleBarOverlay, {
      color: "#171b20",
      symbolColor: "#d3d8df",
      height: 44,
    });
    assert.equal(options.backgroundMaterial, "acrylic");
    assert.equal(options.backgroundColor, "#00000000");
    assert.equal(options.autoHideMenuBar, true);
    assert.equal(options.transparent, false);
    assert.equal(options.trafficLightPosition, undefined);
    assert.equal(options.vibrancy, undefined);
    assert.equal(options.visualEffectState, undefined);
  }
});

test("older and unknown Windows releases use a solid fallback", () => {
  for (const release of ["10.0.19045", "10.0.22000", "6.3.9600", "unknown", "10.0"]) {
    const options = getWindowAppearance("win32", release);
    assert.equal(options.backgroundMaterial, undefined);
    assert.equal(options.backgroundColor, "#171b20");
    assert.equal(options.transparent, false);
    assert.equal(options.titleBarStyle, "hidden");
    assert.ok(options.titleBarOverlay);
    assert.equal(options.vibrancy, undefined);
  }
});

test("Linux retains native window controls with no foreign visual effects", () => {
  const options = getWindowAppearance("linux", "6.12.0");
  assert.equal(options.titleBarStyle, "default");
  assert.equal(options.autoHideMenuBar, true);
  assert.equal(options.transparent, false);
  assert.equal(options.backgroundColor, "#171b20");
  for (const key of [
    "trafficLightPosition",
    "titleBarOverlay",
    "vibrancy",
    "visualEffectState",
    "backgroundMaterial",
  ]) {
    assert.equal(options[key], undefined, key);
  }
});

test("closing without a usable tray always exits", () => {
  for (const platform of ["darwin", "win32", "linux"]) {
    assert.equal(getCloseAction(platform, false), "quit");
    assert.equal(getCloseLabel(platform, false), "Close");
  }
});

test("tray close behavior and labels follow each desktop", () => {
  assert.equal(getCloseAction("darwin", true), "hide");
  assert.equal(getCloseLabel("darwin", true), "Close to Menu Bar");
  assert.equal(getCloseAction("win32", true), "hide");
  assert.equal(getCloseLabel("win32", true), "Close to Tray");
  assert.equal(getCloseAction("linux", true), "minimize");
  assert.equal(getCloseLabel("linux", true), "Minimize to Taskbar");
});


test("Windows light caption controls use a light surface and dark symbols", () => {
  for (const release of ["10.0.22621", "10.0.26100"]) {
    const options = getWindowAppearance("win32", release, false);
    assert.equal(options.titleBarOverlay.color, "#f4f6f8");
    assert.equal(options.titleBarOverlay.symbolColor, "#303a43");
    assert.equal(options.titleBarOverlay.height, 44);
    assert.equal(options.backgroundColor, "#00000000");
    assert.equal(options.backgroundMaterial, "acrylic");
  }
});

test("solid native backgrounds use the resolved light or dark theme", () => {
  for (const [platform, release] of [["win32", "10.0.19045"], ["linux", "6.12.0"]]) {
    const light = getWindowAppearance(platform, release, false);
    const dark = getWindowAppearance(platform, release, true);
    assert.equal(light.backgroundColor, "#f4f6f8");
    assert.equal(dark.backgroundColor, "#171b20");
    assert.equal(light.backgroundMaterial, undefined);
    assert.equal(dark.backgroundMaterial, undefined);
  }
});

test("macOS appearance remains transparent in both system themes", () => {
  for (const dark of [false, true]) {
    const options = getWindowAppearance("darwin", "25.0.0", dark);
    assert.equal(options.backgroundColor, "#00000000");
    assert.equal(options.transparent, true);
    assert.equal(options.vibrancy, "under-window");
    assert.equal(options.titleBarOverlay, undefined);
  }
});
