import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRefused, run } from './tenant-guard-test-support.mjs';

// Smallest proofs for the known S8 guard coverage gaps (coordination 164/165, category b).

const LEGACY_SINK =
  /changed caller hands a tenant to unchanged legacy apps\/web\/src\/legacy\.ts#readForTenant/u;
const caller = specifier =>
  `import { readForTenant } from '${specifier}';\n` +
  'export const g = (tenantId: string) => readForTenant(tenantId);\n';

test('P5: a coexisting .js variant of a stem never hides the .ts module a resolver may load', () => {
  const shadow = {
    'apps/web/src/legacy.js': 'export const readForTenant = tenantId => tenantId;\n',
  };
  for (const specifier of ['./legacy', './legacy.js']) {
    assertRefused(run({ 'apps/web/src/use.ts': caller(specifier) }), 'C1', LEGACY_SINK);
    assertRefused(run({ ...shadow, 'apps/web/src/use.ts': caller(specifier) }), 'C1', LEGACY_SINK);
  }
});

test('P5: a file still takes precedence over a directory index of the same stem', () => {
  const index = {
    'apps/web/src/legacy/index.ts':
      'export const readForTenant = (tenantId: string) => tenantId;\n',
  };
  assertRefused(run({ ...index, 'apps/web/src/use.ts': caller('./legacy') }), 'C1', LEGACY_SINK);
  const alone = run({
    'apps/web/src/legacy.ts': null,
    ...index,
    'apps/web/src/use.ts': caller('./legacy'),
  });
  assert.ok(!alone.violations.some(violation => LEGACY_SINK.test(violation.detail)));
});
