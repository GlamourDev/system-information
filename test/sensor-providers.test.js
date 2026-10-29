const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseWindowsSensors, cpuTemperatureFromSensors, failureReason } = require("../.test-build/sensorProviders.js");
const { getSensorReadings } = require("../.test-build/sensors.js");

test("Windows maps sensor identities and units, preserves stopped fans, and uses total disk counters", () => {
  const data = parseWindowsSensors({ administrator: true, sensors: [
    { Identifier: "/intelcpu/0/temperature/0", Parent: "/intelcpu/0", SensorType: "Temperature", Name: "CPU Package", Value: 62 },
    { Identifier: "/gpu-nvidia/0/temperature/0", SensorType: "Temperature", Name: "GPU Core", Value: 50 },
    { Identifier: "/mainboard/fan/0", SensorType: "Fan", Name: "CPU Fan", Value: 0 },
    { Identifier: "/mainboard/voltage/0", SensorType: "Voltage", Value: null },
    { Identifier: "/cpu/clock/0", SensorType: "Clock", Value: 3200 },
  ], disk: { read: "0", write: 25 } });
  assert.equal(data.readings[2].value, 0);
  assert.equal(data.readings[3].value, null);
  assert.equal(data.readings[4].unit, "MHz");
  assert.equal(data.disk.read, 0);
  assert.equal(cpuTemperatureFromSensors(data).main, 62);
  const readings = getSensorReadings({ extendedSensors: data });
  assert.equal(readings.find((item) => item.id === "temperature").value, 62);
  assert.equal(readings.find((item) => item.id === "write").value, 25);
  assert.ok(!readings.some((item) => item.id === "fansUnavailable"));
  assert.ok(!readings.some((item) => item.id === "gpuTemperature"));
  assert.ok(readings.filter((item) => item.value === null).every((item) => item.reason));
});

test("missing Windows provider explains setup without masking working disk counters", () => {
  const data = parseWindowsSensors({ administrator: false, sensorError: "permission", disk: { read: 4, write: 0 } });
  const readings = getSensorReadings({ extendedSensors: data });
  assert.match(readings.find((item) => item.id === "temperature").reason, /Run as administrator/);
  assert.equal(readings.find((item) => item.id === "read").value, 4);
  assert.equal(readings.find((item) => item.id === "write").reason, undefined);
  assert.match(parseWindowsSensors({ sensorError: "permission" }).reason, /administrator/);
});

test("invalid counters and temperatures never become fabricated zero readings", () => {
  for (const value of [null, undefined, "", "oops", -1, NaN, Infinity]) {
    const data = parseWindowsSensors({ disk: { read: value } });
    assert.equal(data.disk.read, null);
  }
  assert.equal(cpuTemperatureFromSensors({ readings: [{ id: "lhm:/gpu/temperature", unit: "°C", value: 45 }] }), null);
  assert.match(failureReason({ killed: true }), /timed out/);
  assert.match(failureReason({ code: "EACCES" }), /Permission denied/);
});

test("macOS readings replace placeholders and expose die temperatures and fanless reasons", () => {
  const extendedSensors = { readings: [
    { id: "temperature", name: "CPU temperature", group: "Thermals", unit: "°C", value: 48 },
    { id: "cpuDie0", name: "CPU die sensor 1", group: "Thermals", unit: "°C", value: 46 },
    { id: "gpuTemperature", name: "GPU temperature", group: "Thermals", unit: "°C", value: 42 },
  ], reason: "No fan exposed; this Mac may be fanless." };
  const readings = getSensorReadings({ extendedSensors });
  assert.equal(readings.filter((item) => item.id === "temperature").length, 1);
  assert.equal(readings.find((item) => item.id === "cpuDie0").value, 46);
  assert.match(readings.find((item) => item.id === "fansUnavailable").reason, /fanless/);
  assert.equal(cpuTemperatureFromSensors(extendedSensors).main, 48);
});

test("bundled Windows driver setup is detected separately from elevation", () => {
  const missing = parseWindowsSensors({ administrator: true, driverInstalled: false });
  assert.equal(missing.status.setupRequired, true);
  assert.match(missing.reason, /Set up hardware sensors/);
  const limited = parseWindowsSensors({ administrator: false, driverInstalled: true });
  assert.equal(limited.status.setupRequired, false);
  assert.match(limited.reason, /Run as administrator/);
  const noValues = parseWindowsSensors({ administrator: true, driverInstalled: true });
  assert.equal(noValues.status.state, "limited");
});
