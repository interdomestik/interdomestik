import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEDICATED_PRUNE_ARGS,
  EXPECTED_DOCKER_ROOT,
  EXPECTED_RUNNER_TEMP,
  GIB,
  evaluateDedicatedBuilderInspection,
  evaluateRunnerPreflight,
  installStagingIpv4Dns,
  pruneDedicatedBuilder,
  verifyDedicatedBuilder,
} from './cd-runner-preflight.mjs';

const ready = overrides => ({
  runnerName: 'interdomestik-z620-staging',
  runnerOs: 'Linux',
  runnerArch: 'X64',
  runnerTemp: EXPECTED_RUNNER_TEMP,
  dockerRoot: EXPECTED_DOCKER_ROOT,
  dockerAvailable: true,
  runnerTempFreeBytes: 31 * GIB,
  dockerRootFreeBytes: 31 * GIB,
  availableMemoryBytes: 9 * GIB,
  ...overrides,
});

test('accepts only the exclusive Linux X64 staging runner above every floor', () => {
  const result = evaluateRunnerPreflight(ready());
  assert.equal(result.status, 'ready');
  assert.equal(result.runner, 'interdomestik-z620-staging');
});

test('rejects the wrong runner identity, OS, architecture, or Docker state', () => {
  for (const [override, expected] of [
    [{ runnerName: 'interdomestik-mac-Arbens-Mac-mini' }, /exclusive runner/u],
    [{ runnerOs: 'macOS' }, /Linux/u],
    [{ runnerArch: 'ARM64' }, /X64/u],
    [{ dockerAvailable: false }, /Docker/u],
  ]) {
    assert.throws(() => evaluateRunnerPreflight(ready(override)), expected);
  }
});

test('enforces independent 30 GiB runner-temp and Docker-root floors', () => {
  assert.throws(
    () => evaluateRunnerPreflight(ready({ runnerTempFreeBytes: 30 * GIB - 1 })),
    /RUNNER_TEMP.*30 GiB/u
  );
  assert.throws(
    () => evaluateRunnerPreflight(ready({ dockerRootFreeBytes: 30 * GIB - 1 })),
    /Docker data root.*30 GiB/u
  );
});

test('rejects untrusted runner-temp and Docker-root paths', () => {
  assert.throws(
    () => evaluateRunnerPreflight(ready({ runnerTemp: '/tmp/attacker-controlled' })),
    /RUNNER_TEMP.*exclusive runner path/u
  );
  assert.throws(
    () => evaluateRunnerPreflight(ready({ dockerRoot: '/tmp/attacker-controlled' })),
    /Docker data root.*exclusive runner path/u
  );
});

test('enforces the 8 GiB available-memory floor', () => {
  assert.throws(
    () => evaluateRunnerPreflight(ready({ availableMemoryBytes: 8 * GIB - 1 })),
    /available memory.*8 GiB/u
  );
});

test('forces IPv4 DNS only for the opted-in staging deploy process', () => {
  const calls = [];
  const dnsApi = {
    lookup: (hostname, options, callback) => calls.push({ hostname, options, callback }),
  };
  assert.equal(installStagingIpv4Dns({}, dnsApi), false);
  assert.equal(installStagingIpv4Dns({ INTERDOMESTIK_VERCEL_IPV4_ONLY: '1' }, dnsApi), true);
  const callback = () => {};
  dnsApi.lookup('api.vercel.com', { all: true }, callback);
  dnsApi.lookup('vercel.com', callback);
  // prettier-ignore
  assert.deepEqual(calls[0], { hostname: 'api.vercel.com', options: { all: true, family: 4 }, callback });
  assert.deepEqual(calls[1], { hostname: 'vercel.com', options: { family: 4 }, callback });
});

test('publishes only the bounded dedicated-builder prune command', () => {
  assert.deepEqual(DEDICATED_PRUNE_ARGS, [
    'buildx',
    '--builder',
    'interdomestik-cd-staging',
    'prune',
    '--filter',
    'until=168h',
    '--force',
  ]);
  assert.doesNotMatch(DEDICATED_PRUNE_ARGS.join(' '), /system prune|volume|container|image/u);
});

test('accepts only the named running docker-container builder', () => {
  const inspection = [
    'Name:          interdomestik-cd-staging',
    'Driver:        docker-container',
    'Status:        running',
  ].join('\n');
  assert.deepEqual(evaluateDedicatedBuilderInspection(inspection), {
    status: 'ready',
    builder: 'interdomestik-cd-staging',
    driver: 'docker-container',
  });
  for (const invalid of [
    inspection.replace('interdomestik-cd-staging', 'default'),
    inspection.replace('docker-container', 'docker'),
    inspection.replace('running', 'stopped'),
  ]) {
    assert.throws(() => evaluateDedicatedBuilderInspection(invalid), /dedicated buildx builder/u);
  }
});

test('executes only the bounded dedicated-builder prune command', () => {
  const calls = [];
  pruneDedicatedBuilder((command, args, options) => calls.push({ command, args, options }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, '/usr/bin/docker');
  assert.deepEqual(calls[0].args, DEDICATED_PRUNE_ARGS);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.timeout, 300_000);
});

test('inspects the exact dedicated builder without a shell', () => {
  const calls = [];
  verifyDedicatedBuilder((command, args, options) => {
    calls.push({ command, args, options });
    return [
      'Name:          interdomestik-cd-staging',
      'Driver:        docker-container',
      'Status:        running',
    ].join('\n');
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, '/usr/bin/docker');
  assert.deepEqual(calls[0].args, ['buildx', 'inspect', 'interdomestik-cd-staging']);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.timeout, 30_000);
});
