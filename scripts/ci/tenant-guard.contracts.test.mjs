import assert from 'node:assert/strict';
import test from 'node:test';
import { createModuleGraph } from './tenant-guard/modules.mjs';
import { evaluate, sha256 } from './tenant-guard/rules.mjs';
import { fingerprint, parseSource, collectUnits, unitName } from './tenant-guard/syntax.mjs';
import {
  KERNEL,
  PACKAGES,
  assertRefused,
  file,
  pinsOf,
  run,
  runWithBase,
} from './tenant-guard-test-support.mjs';

test('the authority-only entry is accepted in changed code and never counted as legacy', () => {
  const result = run(
    file([
      "import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';",
      'export async function read(authority: any) {',
      '  return withTenantAuthority(authority, async (tx: any) => tx.select());',
      '}',
    ])
  );
  assert.deepEqual(result.violations, []);
});

test('a source-bound contract admits exactly its reviewed unit and nothing after a change', () => {
  const body = [
    'export async function lockRow(tx: any, sql: any, id: string) {',
    '  await tx.execute(sql`select 1 from claims where id = ${id} for update`);',
    '}',
  ];
  const sourceFile = parseSource('apps/web/src/attack.ts', body.join('\n'));
  const [unit] = collectUnits(sourceFile).filter(
    candidate => unitName(candidate, sourceFile) === 'lockRow'
  );
  const contract = {
    file: 'apps/web/src/attack.ts',
    unit: 'lockRow',
    kinds: { execute: 1 },
    sha256: sha256(fingerprint(unit, sourceFile)),
    reason: 'fixture row lock inside the caller tenant transaction',
  };
  assert.deepEqual(run(file(body), { contracts: [contract] }).violations, []);

  const changed = run(file(body.map(line => line.replace('for update', 'for update; select 2'))), {
    contracts: [contract],
  });
  assertRefused(changed, 'C3', /execute needs a source-bound contract/u);
  assertRefused(changed, 'contract', /contract admits 1, source has 0/u);
});

test('a local binding that shadows an imported name is not the privileged symbol', () => {
  const result = run(
    file([
      'export async function read(tx: any) {',
      '  const db = tx;',
      '  return db.select();',
      '}',
    ])
  );
  assert.deepEqual(result.violations, []);
});

test('a forged TenantAuthority is refused at runtime, not by the static pass', () => {
  // packages/database/test/tenant-authority-context.test.ts proves withTenantAuthority rejects
  // look-alikes before a transaction opens; the static pass only has to admit the call.
  const result = run(
    file([
      "import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';",
      "export const forged = () => withTenantAuthority({ tenantId: 'tenant-victim' } as any, async () => 1);",
    ])
  );
  assert.deepEqual(result.violations, []);
});

test('a contracted GUC unit is a tenant sink: a changed caller handing it a tenant is refused', () => {
  const guc = [
    'export async function withReadContext(db: any, sql: any, tenantId: string, action: (tx: any) => unknown) {',
    '  return db.transaction(async (tx: any) => {',
    "    await tx.execute(sql`select set_config('app.current_tenant_id', ${tenantId}, true)`);",
    '    return action(tx);',
    '  });',
    '}',
  ].join('\n');
  const sourceFile = parseSource('apps/web/src/read-context.ts', guc);
  const [unit] = collectUnits(sourceFile).filter(
    candidate => unitName(candidate, sourceFile) === 'withReadContext'
  );
  const contract = {
    file: 'apps/web/src/read-context.ts',
    unit: 'withReadContext',
    kinds: { execute: 1, 'connection-control': 1 },
    sha256: sha256(fingerprint(unit, sourceFile)),
    reason: 'fixture GUC read context',
  };
  const trustedTree = { 'apps/web/src/read-context.ts': guc };
  const sources = new Map(Object.entries({ ...KERNEL, ...trustedTree }));
  const trusted = new Map(sources);
  sources.set(
    'apps/web/src/attack.ts',
    [
      "import { withReadContext } from './read-context';",
      'export const attack = (db: any, sql: any, input: any) => withReadContext(db, sql, input.tenantId, async () => 1);',
    ].join('\n')
  );
  const graph = createModuleGraph({
    sources,
    packages: PACKAGES,
    appAliases: [['@/', 'apps/web/src/']],
  });
  const result = evaluate({
    sources,
    trusted,
    graph,
    contracts: [contract],
    legacyPins: pinsOf(trusted),
  });
  assertRefused(
    result,
    'C1',
    /changed caller hands a tenant to unchanged legacy apps\/web\/src\/read-context.ts#withReadContext/u
  );
});

test('execute with a callback (circuit breaker, idempotency wrapper) is not raw SQL', () => {
  const result = run(
    file([
      'export const send = (breaker: any, params: any) => breaker.execute(() => params.execute());',
    ])
  );
  assert.deepEqual(result.violations, []);
});

test('a cache-wrapped legacy sink stays resolvable and its changed caller is refused', () => {
  const cached = [
    "import { withTenantContext } from '@interdomestik/database';",
    'const cache = <T,>(fn: T) => fn;',
    'export const readCached = cache(async (tenantId: string) =>',
    '  withTenantContext({ tenantId }, (tx: any) => tx.select())',
    ');',
  ].join('\n');
  const sources = new Map(Object.entries({ ...KERNEL, 'apps/web/src/cached.ts': cached }));
  const trusted = new Map(sources);
  sources.set(
    'apps/web/src/attack.ts',
    "import { readCached } from './cached';\nexport const attack = (input: any) => readCached(input.tenantId);\n"
  );
  const graph = createModuleGraph({
    sources,
    packages: PACKAGES,
    appAliases: [['@/', 'apps/web/src/']],
  });
  const result = evaluate({ sources, trusted, graph, contracts: [], legacyPins: pinsOf(trusted) });
  assertRefused(
    result,
    'C1',
    /changed caller hands a tenant to unchanged legacy apps\/web\/src\/cached.ts#readCached/u
  );
  assert.equal(
    result.violations.some(violation => /callers cannot be resolved/u.test(violation.detail)),
    false
  );
});

const POOL_BASE = {
  'apps/web/src/pool.ts': [
    "import { withTenantContext } from '@interdomestik/database';",
    "import { readForTenant } from './legacy';",
    'export async function pool(context: { tenantId: string }) {',
    '  const rows = await withTenantContext({ tenantId: context.tenantId }, tx => tx.select());',
    '  return readForTenant(rows.homeTenantId);',
    '}',
  ].join('\n'),
};
const CHANGED_KERNEL_ENTRY = {
  'packages/database/src/tenant.ts': [
    "import { dbRls } from './db';",
    'export async function withTenantContext(context: unknown, action: (tx: any) => unknown) {',
    '  if (!context) throw new Error("Unrecognized tenant authority");',
    '  return dbRls.transaction(action);',
    '}',
    'export async function withTenantDb(context: unknown, action: (tx: any) => unknown) {',
    '  return withTenantContext(context, action);',
    '}',
  ].join('\n'),
};

test('A5-r2 C: a kernel change to a legacy entry is refused until its reviewed contract is re-pinned', () => {
  const unpinned = runWithBase(POOL_BASE, CHANGED_KERNEL_ENTRY);
  assertRefused(unpinned, 'pin', /legacy kernel entry differs from its reviewed contract/u);
  assertRefused(unpinned, 'C1', /depends on changed code \(withTenantContext\)/u);
  // withTenantDb reaches withTenantContext, so its reviewed contract changed too.
  assert.ok(
    unpinned.violations.some(
      violation => violation.rule === 'pin' && violation.unit === 'withTenantDb'
    )
  );

  const repinned = runWithBase(POOL_BASE, CHANGED_KERNEL_ENTRY, { repin: true });
  assert.deepEqual(repinned.violations, []);
});

test('A5-r2 C: a change to a kernel helper the legacy entry reaches also breaks its pin', () => {
  const result = runWithBase(
    {},
    {
      'packages/database/src/db.ts': KERNEL['packages/database/src/db.ts'].replace(
        'dbRls: any = {}',
        'dbRls: any = { leaked: true }'
      ),
    }
  );
  assertRefused(result, 'pin', /legacy kernel entry differs/u);
});

test('kernel pins bind exact bytes: a comment-only kernel edit breaks the pin', () => {
  const result = runWithBase(
    {},
    {
      'packages/database/src/db.ts': `// reviewed?\n${KERNEL['packages/database/src/db.ts']}`,
    }
  );
  assertRefused(result, 'pin', /legacy kernel entry differs/u);
});

test('fingerprints keep syntax: ASI-separated tokens do not match the joined statement', () => {
  const unitOfText = text => {
    const sourceFile = parseSource('apps/web/src/asi.ts', text);
    const [unit] = collectUnits(sourceFile).filter(each => unitName(each, sourceFile) === 'read');
    return fingerprint(unit, sourceFile);
  };
  const joined = unitOfText('export function read(value: string) {\n  return value;\n}\n');
  const split = unitOfText('export function read(value: string) {\n  return\n  value;\n}\n');
  assert.notEqual(joined, split);
  // Layout alone still matches: the digest follows syntax, not whitespace.
  assert.equal(
    joined,
    unitOfText('export function read(value: string) {\n\n    return value;\n}\n')
  );
});

test('a changed non-legacy kernel helper still taints the unchanged legacy operation it feeds', () => {
  const base = {
    'packages/database/src/pick.ts':
      'export function pickTenant(session: any): string { return session.user.tenantId; }\n',
    'apps/web/src/picked.ts': [
      "import { withTenantContext } from '@interdomestik/database';",
      "import { pickTenant } from '@interdomestik/database/pick';",
      'export async function readPicked(session: any) {',
      '  return withTenantContext({ tenantId: pickTenant(session) }, tx => tx.select());',
      '}',
    ].join('\n'),
  };
  const result = runWithBase(base, {
    'packages/database/src/pick.ts':
      'export function pickTenant(session: any): string { return session.input.tenantId; }\n',
  });
  assertRefused(result, 'C1', /depends on changed code \(pickTenant\)/u);
});
