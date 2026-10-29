import assert from "node:assert/strict";
import { resolve } from "node:path";
import processModule from "../dist/sensorProcess.js";
if (process.platform !== "win32") process.exit(0);
const helper = new processModule.SensorProcess(resolve("native/windows/publish", process.arch, "SensorHelper.exe"));
try {
  for (let i = 0; i < 2; i++) {
    const data = await helper.read();
    assert.equal(data.protocol, 1);
    assert.equal(typeof data.administrator, "boolean");
    assert.ok(Array.isArray(data.sensors));
    assert.ok("disk" in data);
    // CI VMs need not expose thermals; validate the native protocol, not invented hardware values.
  }
  console.log("Bundled Windows helper responded to two consecutive requests.");
} finally { helper.stop(); }
