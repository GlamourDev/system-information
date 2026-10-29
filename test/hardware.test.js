const assert = require('node:assert/strict');
const test = require('node:test');
const { renderHardware } = require('../.test-build/hardware.js');

test('hardware page explains failed queries and missing fields', () => {
  const html = renderHardware({ hardware: { issues: { usb: 'USB query timed out' }, usb: null, audio: [] } });
  assert.match(html, /USB query timed out/);
  assert.match(html, /No devices were reported/);
  assert.match(html, /Not reported/);
  assert.match(html, /data-retry-sensors/);
  assert.doesNotMatch(html, /undefined/);
});

test('device details are collapsed, escaped, and exclude private identifiers', () => {
  const html = renderHardware({ hardware: {
    bios: { vendor: 'Firmware vendor', serial: 'private-firmware' },
    usb: [{ name: '<script>USB</script>', manufacturer: 'A & B', serialNumber: 'private-usb' }],
    audio: [{ name: 'Speakers', driver: '<driver>', status: 'OK' }],
  } });
  assert.match(html, /&lt;script&gt;USB&lt;\/script&gt;/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /&lt;driver&gt;/);
  assert.match(html, /1 detected/);
  assert.match(html, /<details class="sensor-disclosure" data-sensor-disclosure=/);
  assert.doesNotMatch(html, /<details[^>]* open|private-usb|private-firmware/);
});
