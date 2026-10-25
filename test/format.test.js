const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  isFiniteNumber,
  positive,
  nonnegative,
  formatNumber,
  formatBytes,
  formatDuration,
  formatSensor,
} = require("../.test-build/format.js");
const { escapeHtml } = require("../.test-build/dom.js");

test("missing and non-finite readings remain unavailable", () => {
  for (const value of [undefined, null, NaN, Infinity, -Infinity, "12"]) {
    assert.equal(isFiniteNumber(value), false);
    assert.equal(positive(value), null);
    assert.equal(nonnegative(value), null);
    assert.equal(formatNumber(value), "—");
    assert.equal(formatBytes(value), "—");
    assert.equal(formatSensor(value, "%"), "—");
  }
});

test("zero stays a valid utilization or rate reading", () => {
  assert.equal(positive(0), null);
  assert.equal(nonnegative(0), 0);
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatSensor(0, "rate"), "0 B/s");
  assert.match(formatSensor(0, "%"), /^0[.,]0 %$/);
});

test("byte formatting handles fractional bytes and unit boundaries", () => {
  assert.match(formatBytes(0.5), /^0[.,]5 B$/);
  assert.match(formatBytes(1023), /^1[,.\s]?023 B$/);
  assert.match(formatBytes(1024), /^1[.,]0 KB$/);
  assert.match(formatBytes(1024 ** 2), /^1[.,]0 MB$/);
  assert.match(formatBytes(1024 ** 4), /^1[.,]0 TB$/);
  assert.equal(formatBytes(-1), "—");
  assert.equal(formatSensor(-1, "rate"), "—");
});

test("uptime formatting carries minutes into hours and days", () => {
  assert.equal(formatDuration(0), "0h 0m");
  assert.equal(formatDuration(3599), "0h 59m");
  assert.equal(formatDuration(3600), "1h 0m");
  assert.equal(formatDuration(90061), "1d 1h 1m");
  assert.equal(formatDuration(-1), "—");
});

test("sensor units preserve temperature and operation readings", () => {
  assert.match(formatSensor(42.25, "°C"), /^42[.,]3 °C$/);
  assert.match(formatSensor(12, "ops/s"), /^12[.,]0 ops\/s$/);
  assert.equal(formatSensor(1400, "rpm").replace(/[^0-9]/g, ""), "1400");
});

test("hardware strings are escaped before insertion into markup", () => {
  assert.equal(
    escapeHtml('<script title="x">a&b</script>'),
    "&lt;script title=&quot;x&quot;&gt;a&amp;b&lt;/script&gt;",
  );
  assert.equal(escapeHtml("it's"), "it&#39;s");
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(0), "0");
});
