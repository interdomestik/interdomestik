import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEDICATED_PRUNE_ARGS,
  GIB,
  evaluateDedicatedBuilderInspection,
  evaluateRunnerPreflight,
  pruneDedicatedBuilder,
  verifyDedicatedBuilder,
} from './cd-runner-preflight.mjs';

const ready = overrides => ({
  runnerName: 'interdomestik-z620-staging',
  runnerOs: 'Linux',
  runnerArch: 'X64',
  dockerRoot: '/var/lib/docker',
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

test('enforces the 8 GiB available-memory floor', () => {
  assert.throws(
    () => evaluateRunnerPreflight(ready({ availableMemoryBytes: 8 * GIB - 1 })),
    /available memory.*8 GiB/u
  );
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
  assert.equal(calls[0].command, 'docker');
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
  assert.equal(calls[0].command, 'docker');
  assert.deepEqual(calls[0].args, ['buildx', 'inspect', 'interdomestik-cd-staging']);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.timeout, 30_000);
});
