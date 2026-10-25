const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { fitBounds, readWindowState, writeWindowState } = require("../dist/windowUtils.js");

const main = { id: 1, workArea: { x: 0, y: 25, width: 1440, height: 875 } };
const left = { id: 2, workArea: { x: -1920, y: 0, width: 1920, height: 1080 } };

test("preserves a window on a connected secondary display", () => {
  const bounds = { x: -1600, y: 130, width: 1180, height: 790 };
  const fitted = fitBounds(bounds, [main, left], 1);
  for (const key of Object.keys(bounds)) assert.equal(fitted[key], bounds[key]);
});

test("recenters on the primary display when the saved monitor is disconnected", () => {
  const fitted = fitBounds({ x: -1600, y: 130, width: 1180, height: 790 }, [main], 1);
  assert.equal(fitted.x, 130);
  assert.equal(fitted.y, 68);
});

test("keeps the entire window inside the usable display area", () => {
  const fitted = fitBounds({ x: 1300, y: -80, width: 1180, height: 790 }, [main], 1);
  assert.equal(fitted.x, 260);
  assert.equal(fitted.y, 25);
});

test("fits displays smaller than the normal minimum size", () => {
  const display = { id: 3, workArea: { x: 0, y: 24, width: 800, height: 576 } };
  const fitted = fitBounds({ x: 20, y: 40, width: 2000, height: 1200 }, [display], 3);
  assert.deepEqual(fitted, {
    x: 0,
    y: 24,
    width: 800,
    height: 576,
    minWidth: 800,
    minHeight: 576,
  });
});

test("invalid saved dimensions fall back to a centered default", () => {
  const fitted = fitBounds({ x: null, y: NaN, width: -12, height: 790 }, [main], 1);
  assert.equal(fitted.width, 1180);
  assert.equal(fitted.x, 130);
});

test("saves placement and tolerates missing or corrupted state", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hardware-window-state-"));
  const file = path.join(directory, "window-state.json");
  try {
    assert.deepEqual(readWindowState(file), {});
    const saved = {
      bounds: { x: 120, y: 70, width: 1180, height: 790 },
      maximized: true,
    };
    writeWindowState(file, saved);
    assert.deepEqual(readWindowState(file), saved);
    fs.writeFileSync(file, "broken json");
    assert.deepEqual(readWindowState(file), {});
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});
