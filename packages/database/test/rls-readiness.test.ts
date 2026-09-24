import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

for (const scenario of [
  'recovery',
  'concurrent',
  'unsettled',
  'configured',
  'repeated',
  'recovery-wrong-role',
  'recovery-configured-superuser',
  'recovery-query-error',
  'wrong-role',
  'superuser',
  'malformed',
  'missing',
  'invalid-role',
  'query-error',
  'identical-url',
]) {
  test(`RLS readiness: ${scenario}`, () => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        fileURLToPath(new URL('./fixtures/rls-readiness-scenario.ts', import.meta.url)),
        scenario,
      ],
      { encoding: 'utf8', timeout: 20_000, env: { ...process.env, NODE_ENV: 'production' } }
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(
      result.stdout,
      /RLS readiness scenario completed/,
      'scenario must finish all assertions'
    );
  });
}
