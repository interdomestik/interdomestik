import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const preload = fileURLToPath(new URL('./fixtures/fast-lane-effects.cjs', import.meta.url));

test('fast-lane tripwires still refuse arbitrary subprocesses', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--require',
      preload,
      '--eval',
      "require('node:child_process').spawn('/bin/sh', ['-c', 'exit 0'])",
    ],
    { cwd: root, encoding: 'utf8' }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /FAST_LANE_FORBIDDEN_EFFECT: external command/);
});

test('the actual fast lane runs all declared guards and units without operational effects', () => {
  const result = spawnSync(process.execPath, ['--require', preload, 'scripts/check-fast.mjs'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      // Hostile caller settings must never turn this unit lane into an integration run.
      NODE_ENV: 'production',
      TSX_DISABLE_CACHE: '1',
      REQUIRE_RLS_INTEGRATION: '1',
      DATABASE_URL: 'postgresql://unused:unused@remote.invalid:5432/never-connect',
      DATABASE_URL_RLS: 'postgresql://unused:unused@other.invalid:5432/never-connect',
    },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(result.stderr, /FAST_LANE_FORBIDDEN_EFFECT/);
  assert.match(result.stdout, /FAST_LANE_TRANSFORM esbuild/);
  const commands = result.stdout
    .split('\n')
    .filter(line => line.startsWith('FAST_LANE_COMMAND '))
    .map(line => JSON.parse(line.slice('FAST_LANE_COMMAND '.length)));
  const guards = commands.filter(args => args[0]?.startsWith('scripts/'));
  assert.deepEqual(guards, [
    ['scripts/check-i18n.mjs'],
    ['scripts/check-entrypoints-no-db.mjs', '--strict'],
    ['scripts/check-portal-layout-topology.mjs'],
    ['scripts/check-architecture-boundaries.mjs'],
    ['scripts/check-case-recovery-boundaries.mjs'],
    ['scripts/check-country-host-alias-guard.mjs'],
  ]);
  assert.ok(commands.some(args => args.includes('packages/domain-case/src/*.test.ts')));
  assert.ok(commands.some(args => args.includes('packages/domain-recovery/src/*.test.ts')));
  for (const args of commands) {
    assert.doesNotMatch(args.join(' '), /run-turbo|gatekeeper|playwright|next build|db:migrate/);
  }
  assert.match(result.stdout, /tests [1-9][0-9]*/);
  assert.match(result.stdout, /domain-case owns the case status to lifecycle mapping/);
  assert.match(result.stdout, /domain-recovery preserves success-fee collected event identity/);
});
