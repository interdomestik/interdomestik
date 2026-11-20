import assert from 'node:assert/strict';
import test from 'node:test';
import { run } from './tenant-guard-test-support.mjs';
import * as manifest from './tenant-guard/manifest.mjs';
import { byCodeUnit } from './tenant-guard/rules-digest.mjs';

// WP-04 (R-13): the guarded client for destructive scripts is admitted as exactly one driver
// module, confined to the seed-only closure, and the deleted package-root operator scripts lose
// their driver admission, so that a script re-added there is refused again.

const CLIENT = 'packages/database/src/disposable-client.ts';
const clientSource = [
  "import postgres from 'postgres';",
  "import { assertDisposableTarget } from './seed-target-guard';",
  'export function openDisposableClient(url: string) {',
  '  assertDisposableTarget({ DATABASE_URL: url });',
  '  return postgres(url, { max: 1 });',
  '}',
].join('\n');
const driverSource = "import postgres from 'postgres'; export const open = () => postgres;";
const driverRefused = (result, file) =>
  result.violations.some(v => v.file === file && v.rule === 'R-d');

test('the driver admission list is exact', () => {
  assert.deepEqual(
    [...manifest.DRIVER_MODULES].sort(byCodeUnit),
    [
      'packages/database/src/admin-connection-config.ts',
      'packages/database/src/admin-connection-preflight.ts',
      'packages/database/src/db.ts',
      CLIENT,
      'packages/database/src/migrate.ts',
      'packages/database/src/migration-execution-contracts.ts',
      'packages/database/src/migration-ledger-contracts.ts',
      'packages/database/src/seed-target-tls.ts',
      'packages/database/src/seed-utils/cleanup.ts',
      'packages/qa/src/tools/db.ts',
    ].sort(byCodeUnit)
  );
  assert.ok(manifest.SEED_TLS_CLOSURE.has(CLIENT), 'the client stays seed-only');
});

test('the admitted client may import the driver and the seed guard', () => {
  assert.deepEqual(run({ [CLIENT]: clientSource }).violations, []);
});

test('a sibling, a renamed copy or a package-root script gains no driver admission', () => {
  for (const file of [
    'packages/database/src/disposable-client-extra.ts',
    'packages/database/src/disposable-client.tsx',
    'packages/database/src/scripts/disposable-client.ts',
    'packages/database/drop-claims.ts',
    'packages/database/test-db.ts',
    'packages/database/inspect-db.ts',
    'packages/database/hotfix.ts',
  ]) {
    assert.ok(driverRefused(run({ [file]: driverSource }), file), file);
  }
});

test('runtime code may not reach the admitted client', () => {
  for (const file of ['apps/web/src/attack.ts', 'packages/database/src/index.ts']) {
    const specifier =
      file === 'apps/web/src/attack.ts'
        ? '../../../packages/database/src/disposable-client'
        : './disposable-client';
    const result = run({
      [CLIENT]: clientSource,
      [file]: `import { openDisposableClient } from '${specifier}'; openDisposableClient('x');`,
    });
    assert.ok(
      result.violations.some(
        v => v.file === file && v.rule === 'R-a' && /seed-only/u.test(v.detail)
      ),
      `${file}: ${JSON.stringify(result.violations)}`
    );
  }
});
