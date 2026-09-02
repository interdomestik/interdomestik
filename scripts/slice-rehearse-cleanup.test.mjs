import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

test('cleanup wrapper remains present but fails closed before reading or deleting a target', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['slice:cleanup'], 'node scripts/slice-rehearse-ops-cli.mjs --cleanup');
  const result = spawnSync(process.execPath, ['scripts/slice-rehearse-ops-cli.mjs', '--cleanup'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cleanup_hold: crash-safe consumption is unproven/u);
  assert.equal(result.stdout, '');
});
