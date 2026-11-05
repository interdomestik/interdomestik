import assert from 'node:assert/strict';
import test from 'node:test';
import { containsClaimStatusWrite } from '../check-claim-status-writers.mjs';
import { assertRefused, byStage, run, runWithBase } from './tenant-guard-test-support.mjs';

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

test('P7: a claims status write is found under a renamed or namespace import', () => {
  // Built from parts so this file is not itself an inventoried claims.status writer.
  const update = table => `await tx.${'update'}(${table})`;
  const renamed = "import { claims as claimRows } from '@interdomestik/database/schema';\n";
  const namespace = "import * as tables from '@interdomestik/database/schema';\n";
  const writes = [
    `${renamed}${update('claimRows')}.set({ status: 'closed' }).where(match);`,
    `${renamed}const patch = { status: 'closed' };\n${update('claimRows')}.set(patch);`,
    `${namespace}await tx.${'insert'}(tables.claims).values({ id, status: 'draft' });`,
  ];
  for (const source of writes) assert.equal(containsClaimStatusWrite(source), true, source);
  // Another table's status under a namespace import is not a claims write.
  const other = `${namespace}${update('tables.leads')}.set({ status: 'closed' });`;
  assert.equal(containsClaimStatusWrite(other), false);
});

const RECEIVER_BASE = {
  'packages/database/src/db.ts': [
    "import { claims } from './schema';",
    'export const db: any = {};',
    'export const dbAdmin: any = {};',
    'export const dbRls: any = { claims };',
  ].join('\n'),
  'packages/database/src/schema.ts':
    "export const users = {};\nexport const claims = { id: 'id' };\n",
};
const inTransaction = body =>
  runWithBase(RECEIVER_BASE, {
    'apps/web/src/receiver.ts': [
      "import { claims } from '@interdomestik/database';",
      "import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';",
      'export function read(authority: any) {',
      '  return withTenantAuthority(authority, async (tx: any) => {',
      ...body,
      '  });',
      '}',
    ].join('\n'),
  });

test('P4: the real client laundered through a setter or a replaced prototype is refused', () => {
  const unknown = /#claims .* is handed to an unknown receiver/u;
  const cases = {
    setter: [
      '    const box = { set client(c: any) { c.select().from(claims); } };',
      '    box.client = tx;',
    ],
    prototype: [
      '    const fake: any = { from: (table: any) => table };',
      '    Object.setPrototypeOf(fake, tx);',
      '    return fake.from(claims);',
    ],
  };
  for (const [name, body] of Object.entries(cases)) {
    const result = inTransaction(body);
    assertRefused(result, 'C1', unknown);
    assert.ok(byStage(result).lifetime.length > 0, name);
  }
  // A DTO built from the selected rows is the canonical accepted shape.
  const dto = inTransaction([
    '    const rows = await tx.select({ id: claims.id }).from(claims);',
    '    return rows.map((row: any) => ({ id: row.id }));',
  ]);
  assert.deepEqual(dto.violations, []);
});
