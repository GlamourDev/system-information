import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import storage from "../dist/storageHealth.js";
if (!["darwin", "win32"].includes(process.platform)) process.exit(0);
const root = process.argv[2] === "--packaged"
  ? resolve(process.platform === "darwin"
    ? `release/${process.arch === "x64" ? "mac" : `mac-${process.arch}`}/System Information.app/Contents/Resources/smartmontools`
    : "release/win-unpacked/resources/smartmontools")
  : process.argv[2] ? resolve(process.argv[2]) : undefined;
const location = root ? { executable: join(root, process.platform === "win32" ? "smartctl.exe" : "smartctl"), database: join(root, "drivedb.h"), bundled: true } : storage.smartctlLocation();
assert.ok(location.bundled, "Must exercise bundled smartctl, not a system installation");
for (const name of ["drivedb.h", "COPYING", "AUTHORS", "NOTICE.txt", "smartmontools-7.5.tar.gz", "build-smartmontools.mjs", "release.json"]) {
  assert.ok(existsSync(join(resolve(location.executable, ".."), name)), `Missing smartmontools resource: ${name}`);
}
const data = JSON.parse(execFileSync(location.executable, ["-j", "--version"], { encoding: "utf8", env: { ...process.env, PATH: "" }, windowsHide: true }));
assert.deepEqual(data.smartctl.version, [7, 5]);
console.log(`Bundled smartctl 7.5 executes with an empty PATH: ${location.executable}`);
