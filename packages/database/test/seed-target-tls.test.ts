import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

for (const scenario of [
  'ordering',
  'separate-rls',
  'mixed-case-host',
  'local',
  'parity',
  'cleanup',
  'cleanup-replaced',
  'cleanup-error',
  'partial-construction',
  'drift',
  'cached-mismatch',
  'existing-admin',
  'existing-rls',
  'existing-both',
  'missing',
  'empty-variable',
  'relative',
  'unreadable',
  'empty',
  'non-pem',
  'corrupt',
  'mixed',
  'system',
]) {
  test(`seed TLS: ${scenario}`, () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'packages/database/test/seed-target-tls.probe.ts', scenario],
      { encoding: 'utf8', timeout: 30_000 }
    );
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr + result.stdout);
  });
}
