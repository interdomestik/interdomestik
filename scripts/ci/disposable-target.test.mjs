import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Runs in the contracts lane what the database package's unit lane runs in no workflow (TEST-03):
// CHK-13 (a), the refusals of assertDisposableTarget, and the pure part of CHK-12's fourth part,
// the comparison of a journal build with the expected model and the reviewed registry, and the
// registry's own refusals.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SUITES = Object.freeze({
  'test/disposable-target.test.ts': 11,
  'test/journal-schema-parity.test.ts': 10,
  'test/journal-schema-parity-registry.test.ts': 4,
  'test/scratch-database-redaction.test.ts': 1,
});

// The nested runner must report to its own stdout, not to this runner, and must see no database.
const env = { ...process.env, DATABASE_URL: '', DATABASE_URL_RLS: '' };
delete env.NODE_TEST_CONTEXT;

for (const [suite, count] of Object.entries(SUITES)) {
  test(`database suite ${suite} runs and passes all ${count} tests`, () => {
    const result = spawnSync(
      process.execPath,
      [join(root, 'node_modules/tsx/dist/cli.mjs'), '--test', '--test-reporter=tap', suite],
      { cwd: join(root, 'packages/database'), encoding: 'utf8', env }
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, new RegExp(`^# pass ${count}$`, 'mu'));
    assert.match(result.stdout, /^# fail 0$/mu);
    assert.match(result.stdout, /^# skipped 0$/mu);
  });
}
