const { test } = require("node:test");
const assert = require("node:assert/strict");
const { thermalLayout } = require("../.test-build/thermals.js");
const reading = (id, name, unit = "°C", group = "CPU") => ({ id, name, unit, group, value: 45 });

test("identified CPU cores are numbered and sorted without relabeling GPU cores", () => {
  const layout = thermalLayout([
    reading("temperature", "CPU temperature"),
    reading("lhm:/intelcpu/0/temperature/10", "CPU Core #10"),
    reading("lhm:/intelcpu/0/temperature/2", "CPU Core #2"),
    reading("lhm:/intelcpu/0/temperature/0", "CPU Core #0"),
    reading("lhm:/gpu-nvidia/0/temperature/0", "GPU Core"),
  ]);
  assert.deepEqual(layout.cores.map((item) => item.name), ["Core 0", "Core 2", "Core 10"]);
  assert.deepEqual(layout.summary.map((item) => item.name), ["CPU", "GPU"]);
});

test("Apple die probes remain detailed probes, never invented CPU cores", () => {
  const layout = thermalLayout([
    reading("temperature", "CPU temperature"), reading("gpuTemperature", "GPU temperature"),
    ...Array.from({ length: 42 }, (_, i) => reading(`cpuDie${i}`, `CPU die sensor ${i + 1}`)),
    reading("fan0", "Fan 1", "rpm"),
  ]);
  assert.equal(layout.cores.length, 0);
  assert.equal(layout.details.length, 42);
  assert.equal(layout.summary.length, 2);
  assert.equal(layout.fans.length, 1);
});
