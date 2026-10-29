import assert from "node:assert/strict";
import collector from "../dist/machineInfo.js";

const inventory = await collector.inventory();
const sample = await collector.sample();
collector.stopSensors();
assert.equal(inventory.platform, process.platform);
assert.ok(inventory.totalMemory > 0, "Installed memory must be readable");
assert.ok(sample.mem && sample.mem.total > 0, "Live memory data must be readable");
assert.ok(
  sample.currentLoad && Number.isFinite(sample.currentLoad.currentLoad),
  "CPU load must be readable",
);
console.log(`Hardware collector passed on ${process.platform}/${process.arch}`);
