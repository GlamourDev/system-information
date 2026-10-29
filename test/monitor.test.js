const { test } = require("node:test");
const assert = require("node:assert/strict");
const { MonitorModel } = require("../.test-build/monitor.js");
const {
  getActiveMemory,
  getMemoryPercent,
  getNetworkRate,
  getSensorReadings,
} = require("../.test-build/sensors.js");

function createModel() {
  const model = new MonitorModel();
  model.setHardware({});
  return model;
}

function sample(at, fields = {}) {
  return { at, ...fields };
}

function sensorValues(readings) {
  return Object.fromEntries(readings.map((reading) => [reading.id, reading.value]));
}

test("duplicate and out-of-order samples leave history and statistics unchanged", () => {
  const model = createModel();
  assert.equal(model.acceptSample(sample(1000, { currentLoad: { currentLoad: 20 } })), true);
  assert.equal(model.acceptSample(sample(1000, { currentLoad: { currentLoad: 90 } })), false);
  assert.equal(model.acceptSample(sample(500, { currentLoad: { currentLoad: 80 } })), false);
  assert.equal(model.acceptSample(sample(2000, { currentLoad: { currentLoad: 40 } })), true);

  assert.equal(model.lastUpdated, 2000);
  assert.deepEqual(
    model.view.history.map((point) => point.cpu),
    [20, 40],
  );
  assert.deepEqual(model.view.statistics.get("cpu"), {
    min: 20,
    max: 40,
    sum: 60,
    count: 2,
  });
});

test("samples with missing or invalid timestamps are ignored", () => {
  const model = createModel();
  for (const value of [null, undefined, sample(NaN), sample(Infinity), sample("1000")]) {
    assert.equal(model.acceptSample(value), false);
  }
  assert.equal(model.lastUpdated, null);
  assert.deepEqual(model.view.history, []);
  assert.equal(model.view.statistics.size, 0);
  assert.equal(model.acceptSample(sample(0)), true);
  assert.equal(model.lastUpdated, 0);
});

test("unavailable readings remain null and do not contribute to statistics", () => {
  const model = createModel();
  const invalidSample = sample(1000, {
    currentLoad: {
      currentLoad: NaN,
      currentLoadUser: Infinity,
      currentLoadSystem: -1,
      cpus: [{ load: null }, { load: -1 }],
    },
    cpuTemperature: { main: 0 },
    mem: { total: NaN, active: null, available: undefined, used: Infinity, swapused: -1 },
    disksIO: { rIO_sec: null, wIO_sec: -1 },
    networkStats: [{ iface: "eth0", operstate: "up", rx_sec: NaN, tx_sec: null }],
    battery: { hasBattery: true, percent: undefined, voltage: NaN, powerConsumption: 0 },
  });

  model.acceptSample(invalidSample);
  assert.ok(model.view.sensors.length > 0);
  assert.ok(model.view.sensors.every((reading) => reading.value === null));
  assert.equal(model.view.statistics.size, 0);
  assert.deepEqual(model.view.history, [
    {
      at: 1000,
      cpu: null,
      memory: null,
      download: null,
      upload: null,
    },
  ]);

  model.acceptSample(sample(2000));
  assert.ok(model.view.sensors.every((reading) => reading.value === null));
  assert.equal(model.view.statistics.size, 0);
});

test("zero usage and transfer rates remain valid readings", () => {
  const readings = sensorValues(
    getSensorReadings(
      sample(1000, {
        currentLoad: {
          currentLoad: 0,
          currentLoadUser: 0,
          currentLoadSystem: 0,
          cpus: [{ load: 0 }],
        },
        mem: { total: 1024, active: 0, available: 1024, swapused: 0 },
        disksIO: { rIO_sec: 0, wIO_sec: 0 },
        networkStats: [{ iface: "eth0", operstate: "up", rx_sec: 0, tx_sec: 0 }],
      }),
    ),
  );

  for (const id of [
    "cpu",
    "user",
    "system",
    "core0",
    "memoryUsed",
    "memoryPercent",
    "swap",
    "read",
    "write",
    "download",
    "upload",
  ]) {
    assert.equal(readings[id], 0, id);
  }

  const model = createModel();
  model.acceptSample(sample(1000, { currentLoad: { currentLoad: 0 } }));
  assert.deepEqual(model.view.statistics.get("cpu"), { min: 0, max: 0, sum: 0, count: 1 });
  assert.equal(model.view.history[0].cpu, 0);
});

test("network totals exclude loopback, disconnected and invalid interfaces", () => {
  const interfaces = [
    { iface: "lo", operstate: "up", rx_sec: 10000, tx_sec: 10000 },
    { iface: "lo0", operstate: "up", rx_sec: 10000, tx_sec: 10000 },
    { iface: "eth0", operstate: "down", rx_sec: 10000, tx_sec: 10000 },
    { iface: "eth1", operstate: "up", rx_sec: 40, tx_sec: 10 },
    { iface: "eth2", operstate: "up", rx_sec: 0, tx_sec: 0 },
    { iface: "eth3", operstate: "up", rx_sec: NaN, tx_sec: -1 },
  ];
  assert.equal(getNetworkRate(interfaces, "rx_sec"), 40);
  assert.equal(getNetworkRate(interfaces, "tx_sec"), 10);
  assert.equal(getNetworkRate([interfaces[0], interfaces[2], interfaces[4]], "rx_sec"), 0);
  assert.equal(getNetworkRate([interfaces[0], interfaces[2], interfaces[5]], "rx_sec"), null);
  assert.equal(getNetworkRate(undefined, "rx_sec"), null);
  assert.equal(getNetworkRate([], "tx_sec"), null);
});

for (const interval of [1000, 5000]) {
  test(`history retains two minutes at ${interval / 1000}-second sampling`, () => {
    const model = createModel();
    for (let at = 0; at <= 180000; at += interval) {
      model.acceptSample(sample(at, { currentLoad: { currentLoad: at / 1000 } }));
    }

    assert.equal(model.view.history.length, 120000 / interval + 1);
    assert.equal(model.view.history[0].at, 60000);
    assert.equal(model.view.history.at(-1).at, 180000);
    assert.ok(model.view.history.every((point) => point.at >= 60000));

    model.acceptSample(sample(180001));
    assert.equal(model.view.history[0].at, 60000 + interval);
    assert.equal(model.view.history.at(-1).at, 180001);
  });
}

test("active memory falls back to total minus available, then used memory", () => {
  assert.equal(getActiveMemory({ total: 1000, active: 400, available: 300, used: 800 }), 400);
  assert.equal(getMemoryPercent({ total: 1000, active: 400 }), 40);
  assert.equal(getActiveMemory({ total: 1000, active: 0, available: 300, used: 800 }), 0);
  assert.equal(getMemoryPercent({ total: 1000, active: 0 }), 0);

  for (const active of [undefined, null, NaN, -1]) {
    assert.equal(getActiveMemory({ total: 1000, available: 300, active, used: 800 }), 700);
    assert.equal(getMemoryPercent({ total: 1000, available: 300, active }), 70);
  }

  assert.equal(getActiveMemory({ total: 1000, used: 800 }), 800);
  assert.equal(getActiveMemory({ total: NaN, available: 300, used: 800 }), 800);
  assert.equal(getActiveMemory({ active: Infinity, used: 0 }), 0);
  assert.equal(getActiveMemory(undefined), null);
  assert.equal(getActiveMemory({}), null);
  assert.equal(getMemoryPercent({ total: 0, active: 0 }), null);
  assert.equal(getMemoryPercent({ total: NaN, active: 10 }), null);
  assert.equal(getMemoryPercent(undefined), null);
});

test("sensor histories retain missing readings and expire after two minutes", () => {
  const model = createModel();
  model.acceptSample(sample(1000, { cpuTemperature: { main: 50 } }));
  model.acceptSample(sample(2000));
  assert.equal(model.view.sensorHistory[0].readings.find((r) => r.id === "temperature").value, 50);
  assert.equal(model.view.sensorHistory[1].readings.find((r) => r.id === "temperature").value, null);
  model.acceptSample(sample(123000));
  assert.equal(model.view.sensorHistory.length, 1);
});

test("sensor CSV preserves missing values, quotes labels and neutralizes spreadsheet formulas", () => {
  const { createSensorCsv } = require("../.test-build/report.js");
  const csv = createSensorCsv({ sensorHistory: [{ at: 1000, readings: [{ id: "x", group: "Test", name: '=HYPERLINK("bad")', value: null, unit: "°C", reason: "Unavailable" }] }] });
  assert.match(csv, /1970-01-01T00:00:01.000Z/);
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes(',"","°C","Unavailable"'));
});
