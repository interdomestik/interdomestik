import assert from 'node:assert/strict';
import test from 'node:test';
import { containsClaimStatusWrite } from '../check-claim-status-writers.mjs';
import { lifetimeOf } from './tenant-guard-lifetime-test-support.mjs';
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

// P2 — declared S8 boundary (accepted on purpose, coordination 167 and Codex r11): the guard
// protects which tenant a read selects, not where its result is kept. Changed code may call an
// unchanged no-argument read that resolves the tenant from the request session itself, in every
// form below. A module-scope initializer or memo shares the result across requests and tenants;
// revoking the transaction does not protect a cached DTO or promise. A narrow caching rule is
// deferred beyond the transition; review owns module-scope caching until then.
const SESSION_READ = {
  'apps/web/src/session.ts': 'export async function getSession(): Promise<any> { return null; }\n',
  'apps/web/src/mine.ts': [
    "import { withTenantContext } from '@interdomestik/database';",
    "import { getSession } from './session';",
    "import { ensureTenantId } from './tenant-id';",
    'export async function readMine() {',
    '  const session = await getSession();',
    '  return withTenantContext({ tenantId: ensureTenantId(session) }, tx => tx.select());',
    '}',
  ].join('\n'),
};

test('P2 boundary: a session-resolved read is accepted however its result is kept', () => {
  const imported = "import { readMine } from './mine';\n";
  const forms = {
    direct: 'export async function page() { return readMine(); }\n',
    moduleInit: 'const cached = readMine();\nexport async function page() { return cached; }\n',
    moduleMemo: 'let memo: any;\nexport async function page() { return (memo ??= readMine()); }\n',
    timer: 'export function start() { setTimeout(readMine, 10); }\n',
  };
  for (const [name, body] of Object.entries(forms)) {
    const result = runWithBase(SESSION_READ, { 'apps/web/src/use.ts': imported + body });
    assert.deepEqual(result.violations, [], name);
  }
});

test('L1 memo keys: canonically equal but distinct carrier keys never split a forwarding cycle', () => {
  // 'á' (U+00E1) and 'a' + U+0301 are distinct keys that a locale comparison treats as equal; the
  // obligation cache must order them by code unit, or re-entering the cycle with the keys inserted
  // in the other order is not recognised and the chain runs past the analysis bound.
  const HELPERS = 17;
  const name = index => `hop${index % HELPERS}`;
  const helpers = Array.from({ length: HELPERS }, (_, index) => {
    const next =
      index === HELPERS - 1
        ? `${name(0)}({ db: args.db, 'a\\u0301': 2, '\\u00e1': 1 }, n - 1)`
        : `${name(index + 1)}(args, n - 1)`;
    return `async function ${name(index)}(args: any, n: number): Promise<any> { if (n <= 0) return args.db.select(); return await ${next}; }`;
  });
  const entry =
    "export const f = () => W(a, async (tx: any) => await hop0({ db: tx, '\\u00e1': 1, 'a\\u0301': 2 }, 40));";
  const { lifetime } = lifetimeOf([...helpers, entry].join('\n'));
  assert.deepEqual(lifetime, []);
});
