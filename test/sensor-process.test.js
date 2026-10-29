const { test } = require("node:test");
const assert = require("node:assert/strict");
const { SensorProcess } = require("../.test-build/sensorProcess.js");
const { macFailure } = require("../.test-build/macSensors.js");

const responder = `const input = require('node:readline').createInterface({ input: process.stdin }); let count = 0; input.on('line', line => process.stdout.write(JSON.stringify({protocol:1,id:Number(line),count:++count,pid:process.pid})+'\\n'));`;

test("persistent helper reuses a process, coalesces reads and restarts on request", async () => {
  const helper = new SensorProcess(process.execPath, ["-e", responder]);
  try {
    const firstRead = helper.read();
    assert.equal(firstRead, helper.read());
    const first = await firstRead;
    const second = await helper.read();
    assert.equal(second.pid, first.pid);
    assert.equal(second.count, 2);
    helper.stop();
    const third = await helper.read();
    assert.equal(third.count, 1);
    assert.notEqual(third.pid, first.pid);
  } finally { helper.stop(); }
});

test("malformed protocol fails explicitly and backs off until reset", async () => {
  const helper = new SensorProcess(process.execPath, ["-e", `process.stdin.on('data',()=>console.log('{}'));`]);
  try {
    await assert.rejects(helper.read(), { code: "EPROTO" });
    await assert.rejects(helper.read(), { code: "EPROTO" });
  } finally { helper.stop(); }
});

test("stalled and missing helpers fail without hanging the sampler", async () => {
  const stalled = new SensorProcess(process.execPath, ["-e", "process.stdin.resume();"], process.env, 100);
  const missing = new SensorProcess("/nonexistent-system-information-helper");
  try {
    await assert.rejects(stalled.read(), { code: "ETIMEDOUT" });
    await assert.rejects(missing.read(), { code: "ENOENT" });
  } finally { stalled.stop(); missing.stop(); }
});

test("native module load failures are distinguished from hardware access failures", () => {
  assert.match(macFailure(new Error("Cannot find module 'mac_temp_native.node'")), /missing or incompatible/);
  assert.match(macFailure(new Error("NODE_MODULE_VERSION mismatch")), /rebuild:native/);
  assert.match(macFailure(new Error("Failed to read temperature snapshot (IOHID)")), /access failed/);
});
