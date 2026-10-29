const test = require('node:test');
const assert = require('node:assert/strict');
const { parseStorageHealth, readStorageHealth, smartctlLocation } = require('../.test-build/storageHealth.js');
const { renderStorage } = require('../.test-build/storage.js');

test('NVMe preserves zero counters, wear over 100%, and failing health', () => {
  const health = parseStorageHealth({ serial_number: 'secret', smart_status: { passed: false }, smartctl: { exit_status: 8 }, nvme_smart_health_information_log: { power_on_hours: 0, percentage_used: 125, media_errors: 0, data_units_written: 2 } });
  assert.equal(health.passed, false);
  assert.equal(health.reason, undefined);
  assert.equal(health.metrics.find(x => x.label === 'SSD endurance used').value, 125);
  assert.equal(health.metrics.find(x => x.label === 'Power-on hours').value, 0);
  assert.equal(health.metrics.find(x => x.label === 'Data written').value, 1024000);
  assert.doesNotMatch(JSON.stringify(health), /secret|serial_number/);
});
test('ATA keeps vendor raw data without inventing wear from attribute IDs', () => {
  const health = parseStorageHealth({ power_on_time: { hours: 1234 }, ata_smart_attributes: { table: [{ id: 233, name: 'Vendor_Wear', value: 98, worst: 97, thresh: 10, raw: { string: '17 (vendor units)' }, when_failed: 'past' }] } });
  assert.equal(health.attributes[0].raw, '17 (vendor units)');
  assert.equal(health.attributes[0].failed, 'past');
  assert.equal(health.metrics.some(x => x.label === 'SSD endurance used'), false);
});
test('missing and invalid health stays unavailable, while partial errors retain data', () => {
  assert.equal(parseStorageHealth(null).passed, null);
  assert.equal(parseStorageHealth({ temperature: { current: NaN }, power_cycle_count: -1 }).metrics.length, 0);
  const partial = parseStorageHealth({ smartctl: { exit_status: 4 }, power_on_time: { hours: 15 } });
  assert.match(partial.reason, /commands failed/);
  assert.equal(partial.metrics[0].value, 15);
});
test('rejects non-device paths before executing smartctl', async () => {
  assert.match((await readStorageHealth('/tmp/disk; echo unsafe')).reason, /physical-device path/);
});
test('storage renders escaped attributes and missing wear without a fabricated score', () => {
  const health = parseStorageHealth({ ata_smart_attributes: { table: [{ id: 5, name: '<test>', raw: { string: '<raw>' } }] } });
  const html = renderStorage({ sensors: [], hardware: { fsSize: [], diskLayout: [{ device: '/dev/disk0', name: 'SSD', health }] } });
  assert.match(html, /&lt;test&gt;/);
  assert.match(html, /&lt;raw&gt;/);
  assert.match(html, /Not reported by this drive/);
  assert.match(html, /Refresh storage health/);
});

test('collector handles nonzero SMART warnings, missing tools, and bare macOS disk paths', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  let response = { error: Object.assign(new Error('health warning'), { code: 8 }), stdout: JSON.stringify({ smart_status: { passed: false }, power_on_time: { hours: 42 } }) };
  let argumentsUsed;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../.test-build/storageHealth.js'), 'utf8'), {
    module, exports: module.exports, process, __dirname: "/development/dist",
    require: name => name === 'node:child_process' ? { execFile: (file, args, options, callback) => { argumentsUsed = args; callback(response.error, response.stdout); } } : require(name),
  });
  const read = module.exports.readStorageHealth;
  const warning = await read('disk0');
  assert.equal(argumentsUsed.at(-1), '/dev/disk0');
  assert.equal(warning.passed, false);
  assert.equal(warning.metrics[0].value, 42);
  response = { error: Object.assign(new Error('missing'), { code: 'ENOENT' }), stdout: '' };
  assert.match((await read('/dev/disk0')).reason, /build:smartmontools/);
  response = { error: Object.assign(new Error('timeout'), { killed: true }), stdout: '' };
  assert.match((await read('/dev/disk0')).reason, /timed out/);
});


test('packaged macOS and Windows always resolve the bundled tool and database', () => {
  const { join } = require('node:path');
  for (const [platform, arch, name] of [['darwin', 'arm64', 'smartctl'], ['darwin', 'x64', 'smartctl'], ['win32', 'x64', 'smartctl.exe']]) {
    const location = smartctlLocation(platform, arch, '/app/resources', '/app/resources/app.asar/dist');
    assert.equal(location.bundled, true);
    assert.equal(location.executable, join('/app/resources', 'smartmontools', name));
    assert.equal(location.database, join('/app/resources', 'smartmontools', 'drivedb.h'));
  }
});

test('bundled collector ignores system SMART data and passes the bundled database', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const path = require('node:path');
  // Exercise both path formats on every runner, including macOS/Linux CI.
  for (const paths of [path.posix, path.win32]) {
    for (const platform of ['darwin', 'win32']) {
      const resources = paths.resolve('/app/resources');
      let invocation;
      const module = { exports: {} };
      vm.runInNewContext(fs.readFileSync(require.resolve('../.test-build/storageHealth.js'), 'utf8'), {
        module, exports: module.exports, __dirname: paths.join(resources, 'app.asar', 'dist'),
        process: { platform, arch: platform === 'win32' ? 'x64' : 'arm64', resourcesPath: resources, env: {} },
        require: name => name === 'node:path' ? paths : name === 'node:child_process' ? { execFile: (file, args, options, callback) => {
          invocation = { file, args };
          callback(null, JSON.stringify({ power_on_time: { hours: 10 } }));
        } } : require(name),
      });
      const device = platform === 'win32' ? String.raw`\\.\PhysicalDrive0` : 'disk0';
      const health = await module.exports.readStorageHealth(device, { power_on_time: { hours: 999 } });
      assert.equal(health.metrics[0].value, 10);
      assert.equal(invocation.file, paths.join(resources, 'smartmontools', platform === 'win32' ? 'smartctl.exe' : 'smartctl'));
      assert.equal(invocation.args[invocation.args.indexOf('-B') + 1], paths.join(resources, 'smartmontools', 'drivedb.h'));
    }
  }
});
