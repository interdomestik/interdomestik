import assert from 'node:assert/strict';
import test from 'node:test';
import { createModuleGraph } from './tenant-guard/modules.mjs';
import { evaluate, sha256 } from './tenant-guard/rules.mjs';
import { fingerprint, parseSource, collectUnits, unitName } from './tenant-guard/syntax.mjs';

// R-e adversarial fixtures for the tenant guard S″. Each negative is a failing source the guard
// must refuse; the baseline proves the same fixture tree is accepted when nothing changed.

const KERNEL = {
  'packages/database/src/db.ts':
    'export const db: any = {};\nexport const dbAdmin: any = {};\nexport const dbRls: any = {};\n',
  'packages/database/src/tenant.ts': [
    "import { dbRls } from './db';",
    'export async function withTenantContext(context: unknown, action: (tx: any) => unknown) {',
    '  return dbRls.transaction(action);',
    '}',
    'export async function withTenantDb(context: unknown, action: (tx: any) => unknown) {',
    '  return withTenantContext(context, action);',
    '}',
  ].join('\n'),
  'packages/database/src/tenant-authority.ts': [
    'export function mintTenantAuthority(grant: unknown) { return Object.freeze({}); }',
    'export function readTenantAuthority(authority: unknown) { return authority; }',
  ].join('\n'),
  'packages/database/src/tenant-authority-public.ts':
    "export { readTenantAuthority } from './tenant-authority';\n",
  'packages/database/src/tenant-authority-registrar.ts':
    "export { mintTenantAuthority } from './tenant-authority';\n",
  'packages/database/src/tenant-authority-context.ts': [
    "import { withTenantContext } from './index';",
    'export async function withTenantAuthority(authority: unknown, action: (tx: any) => unknown) {',
    '  return withTenantContext(authority, action);',
    '}',
  ].join('\n'),
  'packages/database/src/schema.ts': 'export const users = {};\n',
  'packages/database/src/index.ts': [
    "export { withTenantContext, withTenantDb } from './tenant';",
    "export { db, dbAdmin, dbRls } from './db';",
    "export * from './schema';",
  ].join('\n'),
  'apps/web/src/lib/tenant-authority.server.ts': [
    "import { mintTenantAuthority } from '@interdomestik/database/tenant-authority-registrar';",
    'export function authorizeSessionTenant(session: any) {',
    "  return mintTenantAuthority({ tenantId: session.user.tenantId, purpose: 'session' });",
    '}',
  ].join('\n'),
  'apps/web/src/tenant-id.ts':
    'export function ensureTenantId(session: any): string { return session.user.tenantId; }\n',
  'apps/web/src/legacy.ts': [
    "import { withTenantContext } from '@interdomestik/database';",
    "import { ensureTenantId } from './tenant-id';",
    'export async function readThing(session: any) {',
    '  return withTenantContext({ tenantId: ensureTenantId(session) }, tx => tx.select());',
    '}',
    'export async function readForTenant(tenantId: string) {',
    '  return withTenantContext({ tenantId }, tx => tx.select());',
    '}',
  ].join('\n'),
  'apps/web/src/forwarder.ts': [
    "import { readForTenant } from './legacy';",
    'export async function forward(tenantId: string) {',
    '  return readForTenant(tenantId);',
    '}',
  ].join('\n'),
  'apps/web/src/legacy.test.ts':
    "import { dbAdmin } from '@interdomestik/database';\nexport const x = dbAdmin;\n",
};

const PACKAGES = new Map([
  [
    '@interdomestik/database',
    {
      name: '@interdomestik/database',
      dir: 'packages/database',
      exports: {
        '.': './src/index.ts',
        './db': './src/db.ts',
        './tenant-authority': './src/tenant-authority-public.ts',
        './tenant-authority-registrar': './src/tenant-authority-registrar.ts',
        './tenant-authority-context': './src/tenant-authority-context.ts',
      },
      main: './src/index.ts',
    },
  ],
]);

// The fixture kernel is its own reviewed contract: pin the legacy digests of the trusted tree.
function pinsOf(trusted) {
  const graph = createModuleGraph({
    sources: trusted,
    packages: PACKAGES,
    appAliases: [['@/', 'apps/web/src/']],
  });
  const { legacyDigests } = evaluate({
    sources: trusted,
    trusted,
    graph,
    contracts: [],
    legacyPins: null,
  });
  return new Map(Object.entries(legacyDigests));
}

function run(changes = {}, { contracts = [], resolution, packages = PACKAGES } = {}) {
  const trusted = new Map(Object.entries(KERNEL));
  const sources = new Map(trusted);
  for (const [file, text] of Object.entries(changes)) {
    if (text === null) sources.delete(file);
    else sources.set(file, text);
  }
  const graph = createModuleGraph({
    sources,
    packages,
    appAliases: [['@/', 'apps/web/src/']],
    resolution,
  });
  return evaluate({ sources, trusted, graph, contracts, legacyPins: pinsOf(trusted) });
}

function assertRefused(result, rule, pattern) {
  const match = result.violations.find(
    violation => violation.rule === rule && pattern.test(violation.detail)
  );
  assert.ok(
    match,
    `expected ${rule} ${pattern}; got ${JSON.stringify(result.violations, null, 2)}`
  );
}

const file = body => ({ 'apps/web/src/attack.ts': body.join('\n') });

test('baseline: the unchanged fixture tree is accepted and its legacy operations are counted', () => {
  const result = run();
  assert.deepEqual(result.violations, []);
  assert.equal(result.telemetry.legacyAccepted, 2);
});

test('A5-r1 C1: substituting an untrusted tenant at the same count, file and import is refused', () => {
  const result = run({
    'apps/web/src/legacy.ts': KERNEL['apps/web/src/legacy.ts'].replace(
      '{ tenantId: ensureTenantId(session) }',
      '{ tenantId: session.input.tenantId, accessTenantId: session.input.tenantId }'
    ),
  });
  assertRefused(result, 'C1', /withTenantContext in a changed unit/u);
});

test('an unchanged legacy operation whose tenant helper changed is refused', () => {
  const result = run({
    'apps/web/src/tenant-id.ts':
      'export function ensureTenantId(session: any): string { return session.input.tenantId; }\n',
  });
  assertRefused(result, 'C1', /depends on changed code \(ensureTenantId\)/u);
});

test('a changed caller handing a tenant to an unchanged legacy function is refused', () => {
  const result = run(
    file([
      "import { readForTenant } from './legacy';",
      'export async function attack(input: { tenantId: string }) { return readForTenant(input.tenantId); }',
    ])
  );
  assertRefused(
    result,
    'C1',
    /changed caller hands a tenant to unchanged legacy apps\/web\/src\/legacy.ts#readForTenant/u
  );
});

test('an unchanged forwarder becomes a sink, so its changed caller is refused too', () => {
  const result = run(
    file([
      "import { forward } from './forwarder';",
      "export async function attack() { return forward('tenant-victim'); }",
    ])
  );
  assertRefused(result, 'C1', /unchanged legacy apps\/web\/src\/forwarder.ts#forward/u);
});

test('a legacy sink passed as a value is refused', () => {
  const result = run(
    file(["import { readForTenant } from './legacy';", 'export const handlers = [readForTenant];'])
  );
  assertRefused(result, 'C1', /legacy tenant sink .*#readForTenant used as value/u);
});

test('alias of the legacy entry is refused', () => {
  const result = run(
    file([
      "import { withTenantContext } from '@interdomestik/database';",
      'export const run = withTenantContext;',
    ])
  );
  assertRefused(result, 'C1', /withTenantContext used as value/u);
});

test('closure capture of a privileged client is refused', () => {
  const result = run(
    file([
      "import { dbAdmin } from '@interdomestik/database';",
      'export const later = () => dbAdmin;',
    ])
  );
  assertRefused(result, 'R-a', /dbAdmin is not available to this file/u);
});

test('destructuring a privileged client out of a namespace import is refused', () => {
  const result = run(
    file([
      "import * as database from '@interdomestik/database';",
      'const { dbAdmin } = database;',
      'export const read = () => dbAdmin.select();',
    ])
  );
  assertRefused(result, 'R-a', /opaque use of a privileged module object database/u);
});

test('namespace member access to a privileged client is refused', () => {
  const result = run(
    file([
      "import * as database from '@interdomestik/database';",
      'export const read = () => database.dbAdmin.select();',
    ])
  );
  assertRefused(result, 'R-a', /dbAdmin is not available to this file/u);
});

test('computed member access on a privileged namespace is refused', () => {
  const result = run(
    file([
      "import * as database from '@interdomestik/database';",
      "export const read = () => database['db' + 'Admin'].select();",
    ])
  );
  assertRefused(result, 'R-a', /opaque use of a privileged module object/u);
});

test('a default import of a privileged module is refused', () => {
  const result = run(
    file([
      "import database from '@interdomestik/database';",
      'export const read = () => database.dbAdmin.select();',
    ])
  );
  assertRefused(result, 'R-a', /opaque use of a privileged module object/u);
});

test('re-exporting a privileged client is refused', () => {
  const result = run(file(["export { dbAdmin } from '@interdomestik/database';"]));
  assertRefused(result, 'R-a', /re-export of packages\/database\/src\/db.ts#dbAdmin/u);
});

test('re-exporting the registrar through a barrel is refused, and the barrel cannot be used', () => {
  const result = run({
    'apps/web/src/barrel.ts':
      "export * from '@interdomestik/database/tenant-authority-registrar';\n",
    ...file([
      "import { mintTenantAuthority } from './barrel';",
      "export const forged = mintTenantAuthority({ tenantId: 'tenant-victim', purpose: 'session' });",
    ]),
  });
  assertRefused(
    result,
    'R-a',
    /re-export of packages\/database\/src\/tenant-authority.ts#mintTenantAuthority/u
  );
  assertRefused(result, 'R-a', /mintTenantAuthority is not available to this file/u);
});

test('reaching the minting module through a tsconfig paths subpath is refused', () => {
  const result = run(
    file([
      "import { mintTenantAuthority } from '@interdomestik/database/tenant-authority';",
      "export const forged = mintTenantAuthority({ tenantId: 'tenant-victim', purpose: 'session' });",
    ])
  );
  assertRefused(result, 'R-a', /mintTenantAuthority is not available to this file/u);
});

test('a privileged export forwarded as a callback is refused', () => {
  const result = run(
    file([
      "import { mintTenantAuthority } from '@interdomestik/database/tenant-authority-registrar';",
      'export const all = (grants: unknown[]) => grants.map(mintTenantAuthority);',
    ])
  );
  assertRefused(result, 'R-a', /mintTenantAuthority is not available to this file/u);
});

test('dbAdmin passed as an argument is refused even in an allowed file', () => {
  const result = run({
    'packages/database/src/tenant.ts': KERNEL['packages/database/src/tenant.ts'].replace(
      "import { dbRls } from './db';",
      "import { dbAdmin, dbRls } from './db';\nexport const leak = (sink: (client: unknown) => void) => sink(dbAdmin);"
    ),
  });
  assertRefused(result, 'R-a', /dbAdmin used as value; only a direct member is allowed/u);
});

test('dynamic import of a privileged module is refused', () => {
  const result = run(
    file([
      "export const read = async () => (await import('@interdomestik/database')).dbAdmin.select();",
    ])
  );
  assertRefused(result, 'R-e', /dynamic import of privileged module @interdomestik\/database/u);
});

test('an opaque dynamic import and require of a privileged module are refused', () => {
  const result = run(
    file([
      'export const load = async (name: string) => import(name);',
      "export const legacy = () => require('@interdomestik/database');",
    ])
  );
  assertRefused(result, 'R-e', /opaque dynamic import/u);
  assertRefused(result, 'R-e', /dynamic import of privileged module/u);
});

test('Reflect, bind, call and apply on the legacy entry are refused', () => {
  const result = run(
    file([
      "import { withTenantContext } from '@interdomestik/database';",
      "export const a = () => Reflect.apply(withTenantContext, null, [{ tenantId: 'x' }, () => 1]);",
      "export const b = () => withTenantContext.call(null, { tenantId: 'x' }, () => 1);",
      'export const c = withTenantContext.bind(null);',
    ])
  );
  const details = result.violations
    .filter(violation => violation.rule === 'C1')
    .map(violation => violation.detail);
  assert.ok(
    details.some(detail => /used as value/u.test(detail)),
    details.join('\n')
  );
  assert.equal(
    details.filter(detail => /used as member/u.test(detail)).length,
    2,
    details.join('\n')
  );
});

test('eval and Function are refused', () => {
  const result = run(
    file([
      "export const a = () => eval('1');",
      "export const b = () => new Function('return 1');",
      "export const c = () => Function('return 1')();",
    ])
  );
  assert.equal(result.violations.filter(violation => violation.rule === 'R-e').length, 3);
});

test('GUC SQL in a template outside tenant.ts is refused', () => {
  const result = run(
    file([
      'export async function pin(tx: any, sql: any, tenantId: string) {',
      "  await tx.execute(sql`select set_config('app.current_tenant_id', ${tenantId}, true)`);",
      '  await tx.execute(sql`set local role app_admin`);',
      '  await tx.execute(sql`set local row_security = off`);',
      '}',
    ])
  );
  assert.equal(result.violations.filter(violation => violation.rule === 'R-d').length, 3);
  assert.equal(result.violations.filter(violation => violation.rule === 'C3').length, 3);
});

test('drivers and client construction outside the manifest are refused', () => {
  const result = run(
    file([
      "import postgres from 'postgres';",
      "import { drizzle } from 'drizzle-orm/postgres-js';",
      'export const client = drizzle(postgres(process.env.DATABASE_URL!));',
    ])
  );
  assert.equal(result.violations.filter(violation => violation.rule === 'R-d').length, 3);
});

test('a lazy builder taken from the ambient client in changed code is refused', () => {
  const result = run(
    file([
      "import { db, users } from '@interdomestik/database';",
      "import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';",
      'export async function read(authority: any) {',
      '  const query = db.select().from(users);',
      '  return withTenantAuthority(authority, async () => query);',
      '}',
    ])
  );
  assertRefused(result, 'C1', /db.ts#db in a changed unit/u);
});

test('runtime code importing a test module is refused', () => {
  const result = run(file(["import { x } from './legacy.test';", 'export const y = x;']));
  assertRefused(result, 'R-a', /runtime import of test module/u);
});

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

function runWithBase(base, changes = {}, { repin = false } = {}) {
  const trusted = new Map(Object.entries({ ...KERNEL, ...base }));
  const sources = new Map(trusted);
  for (const [path, text] of Object.entries(changes)) sources.set(path, text);
  const graph = createModuleGraph({
    sources,
    packages: PACKAGES,
    appAliases: [['@/', 'apps/web/src/']],
  });
  // repin: the changed kernel was reviewed and its digests pinned; otherwise the trusted pins hold.
  return evaluate({
    sources,
    trusted,
    graph,
    contracts: [],
    legacyPins: pinsOf(repin ? sources : trusted),
  });
}

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

// ---- A5-r2 A: module state read by a retained tenant input -----------------------------------

const MODULE_CONTEXT_BASE = {
  'apps/web/src/module-context.ts': [
    "import { withTenantContext } from '@interdomestik/database';",
    "const context = { tenantId: 'tenant-A' };",
    'export function read() {',
    '  return withTenantContext(context, tx => tx.select());',
    '}',
  ].join('\n'),
};

test('A5-r2 A: a changed writer to a module-bound tenant context is refused', () => {
  const result = runWithBase(MODULE_CONTEXT_BASE, {
    'apps/web/src/module-context.ts': [
      MODULE_CONTEXT_BASE['apps/web/src/module-context.ts'],
      'export function attack(input: { tenantId: string }) {',
      '  context.tenantId = input.tenantId;',
      '  return read();',
      '}',
    ].join('\n'),
  });
  assertRefused(
    result,
    'C1',
    /module state apps\/web\/src\/module-context.ts#context .* is written by changed code/u
  );
});

test('A5-r2 A: unchanged code that lets the tenant state escape is refused', () => {
  const result = runWithBase({
    'apps/web/src/module-context.ts': [
      MODULE_CONTEXT_BASE['apps/web/src/module-context.ts'],
      'export function getContext() {',
      '  return context;',
      '}',
    ].join('\n'),
  });
  assertRefused(result, 'C1', /module state .*#context .* escapes/u);
});

test('A5-r2 A: changed code mutating tenant state through a method or a changed callee is refused', () => {
  const base = {
    'apps/web/src/contexts.ts': [
      "import { withTenantContext } from '@interdomestik/database';",
      "export const CONTEXTS = [{ tenantId: 'tenant-A' }];",
      'export function readFirst() {',
      '  return withTenantContext(CONTEXTS[0], tx => tx.select());',
      '}',
    ].join('\n'),
    'apps/web/src/rewrite.ts': 'export function rewrite(value: any) { return value; }\n',
  };
  const mutated = runWithBase(base, {
    'apps/web/src/attack.ts': [
      "import { CONTEXTS } from './contexts';",
      "export function attack() { CONTEXTS.unshift({ tenantId: 'tenant-victim' }); }",
    ].join('\n'),
  });
  assertRefused(
    mutated,
    'C1',
    /module state .*#CONTEXTS .* is mutated by changed code \(unshift\)/u
  );

  const handed = runWithBase(base, {
    'apps/web/src/rewrite.ts':
      "export function rewrite(value: any) { value[0].tenantId = 'tenant-victim'; }\n",
    'apps/web/src/attack.ts': [
      "import { CONTEXTS } from './contexts';",
      "import { rewrite } from './rewrite';",
      'export function attack() { rewrite(CONTEXTS); }',
    ].join('\n'),
  });
  assertRefused(handed, 'C1', /module state .*#CONTEXTS .* is passed to changed code \(rewrite\)/u);
});

test('A5-r2 A: primitive module constants and member reads from changed code are accepted', () => {
  const base = {
    'apps/web/src/fixed.ts': [
      "import { withTenantContext } from '@interdomestik/database';",
      "export const TENANT = 'tenant-A';",
      "export const context = { tenantId: 'tenant-B' };",
      'export function readFixed() {',
      '  return withTenantContext({ tenantId: TENANT }, tx => tx.select());',
      '}',
      'export function readContext() {',
      '  return withTenantContext(context, tx => tx.select());',
      '}',
    ].join('\n'),
  };
  const result = runWithBase(base, {
    'apps/web/src/reader.ts': [
      "import { TENANT, context } from './fixed';",
      'export function describe(input: string) {',
      '  return input === TENANT || context.tenantId === input ? `tenant ${context.tenantId}` : null;',
      '}',
    ].join('\n'),
  });
  assert.deepEqual(result.violations, []);
  // The function a retained tenant input calls is discovered too; it is refused only if reassigned.
  assert.deepEqual(result.tenantState, [
    'apps/web/src/fixed.ts#context',
    'apps/web/src/tenant-id.ts#ensureTenantId',
  ]);
});

// ---- A5-r2 B: transaction transfers out of a retained legacy operation -----------------------

const WORK_BASE = {
  'apps/web/src/work.ts': 'export function work(tx: any) { return tx.select(); }\n',
  'apps/web/src/work-read.ts': [
    "import { withTenantContext } from '@interdomestik/database';",
    "import { work } from './work';",
    'export function read() {',
    "  return withTenantContext({ tenantId: 'tenant-A' }, tx => work(tx));",
    '}',
    'export function readByReference() {',
    "  return withTenantContext({ tenantId: 'tenant-A' }, work);",
    '}',
    'export function readNested() {',
    "  return withTenantContext({ tenantId: 'tenant-A' }, tx => tx.transaction((inner: any) => work({ db: inner })));",
    '}',
  ].join('\n'),
};

test('A5-r2 B: an unchanged legacy context handing its transaction to unchanged helpers is accepted', () => {
  assert.deepEqual(runWithBase(WORK_BASE).violations, []);
});

test('A5-r2 B: a changed transaction helper of an unchanged legacy context is refused', () => {
  const result = runWithBase(WORK_BASE, {
    'apps/web/src/work.ts': 'export function work(tx: any) { return tx; }\n',
  });
  const transfers = result.violations.filter(violation =>
    /hands its transaction to changed code \(work\)/u.test(violation.detail)
  );
  assert.deepEqual(transfers.map(violation => violation.unit).sort(), [
    'read',
    'readByReference',
    'readNested',
  ]);
});

test('A5-r2 B: a transaction returned, stored or handed to an opaque callee is refused', () => {
  const result = runWithBase({
    'apps/web/src/leak.ts': [
      "import { withTenantContext } from '@interdomestik/database';",
      'let kept: any;',
      "export function leakReturn() { return withTenantContext({ tenantId: 'tenant-A' }, tx => tx); }",
      "export function leakStore() { return withTenantContext({ tenantId: 'tenant-A' }, async tx => { kept = tx; }); }",
      "export function leakCallee(run: (tx: any) => unknown) { return withTenantContext({ tenantId: 'tenant-A' }, tx => run(tx)); }",
    ].join('\n'),
  });
  assertRefused(result, 'C1', /hands its transaction to an unsupported transfer/u);
  assert.equal(
    result.violations.filter(violation => /unsupported transfer/u.test(violation.detail)).length,
    2
  );
  assertRefused(
    result,
    'C1',
    /hands its transaction to a callee taken from the parameters of leakCallee/u
  );
});

// ---- A5-r2 re-review Q1–Q4 --------------------------------------------------------------------

const GET_CONTEXT_BASE = {
  'apps/web/src/get-context.ts': [
    "import { withTenantContext } from '@interdomestik/database';",
    "const context = { tenantId: 'tenant-A' };",
    'function getContext() { return context; }',
    'export function read() {',
    '  return withTenantContext(getContext(), tx => tx.select());',
    '}',
  ].join('\n'),
};

test('Q1: module state reached only through an unchanged function is discovered and guarded', () => {
  const base = runWithBase(GET_CONTEXT_BASE);
  assert.ok(base.tenantState.includes('apps/web/src/get-context.ts#context'));
  // Returning the state object is itself an escape: function-mediated mutable state is refused.
  assertRefused(base, 'C1', /module state .*#context .* escapes \(return context;\)/u);

  const attacked = runWithBase(GET_CONTEXT_BASE, {
    'apps/web/src/get-context.ts': [
      GET_CONTEXT_BASE['apps/web/src/get-context.ts'],
      'export function attack(input: any) { context.tenantId = input.tenantId; return read(); }',
    ].join('\n'),
  });
  assertRefused(attacked, 'C1', /module state .*#context .* is written by changed code/u);
});

test('Q1: a function whose return reads only primitives adds no value state', () => {
  const result = runWithBase({
    'apps/web/src/fixed-fn.ts': [
      "import { withTenantContext } from '@interdomestik/database';",
      "const TENANT = 'tenant-A';",
      'function tenant() { return { tenantId: TENANT }; }',
      'export function read() { return withTenantContext(tenant(), tx => tx.select()); }',
    ].join('\n'),
  });
  assert.deepEqual(result.violations, []);
  assert.deepEqual(
    result.tenantState.filter(key => key.startsWith('apps/web/src/fixed-fn.ts')),
    ['apps/web/src/fixed-fn.ts#tenant']
  );
});

test('Q1: an unchanged writer whose write takes its parameters is held to the sink caller rules', () => {
  const base = {
    'apps/web/src/remember.ts': [
      "import { withTenantContext } from '@interdomestik/database';",
      "const context = { tenantId: 'tenant-A' };",
      'export function remember(tenantId: string) { context.tenantId = tenantId; }',
      'export function read() { return withTenantContext(context, tx => tx.select()); }',
    ].join('\n'),
  };
  const fromInput = runWithBase(base, {
    'apps/web/src/attack.ts': [
      "import { remember } from './remember';",
      'export function attack(input: any) { remember(input.tenantId); }',
    ].join('\n'),
  });
  assertRefused(
    fromInput,
    'C1',
    /changed caller hands an input to the tenant-state writer apps\/web\/src\/remember.ts#remember/u
  );

  const fixed = runWithBase(base, {
    'apps/web/src/attack.ts': [
      "import { remember } from './remember';",
      "export function reset() { remember('tenant-A'); }",
    ].join('\n'),
  });
  assert.deepEqual(fixed.violations, []);
});

test('Q2: kernel tenant state obeys the ordinary callee, escape and alias rules', () => {
  const base = {
    'packages/database/src/kernel-context.ts':
      "export const kernelContext = { tenantId: 'tenant-A' };\n",
    'apps/web/src/kernel-read.ts': [
      "import { withTenantContext } from '@interdomestik/database';",
      "import { kernelContext } from '../../../packages/database/src/kernel-context';",
      'export function read() { return withTenantContext(kernelContext, tx => tx.select()); }',
    ].join('\n'),
    'apps/web/src/rewrite.ts': 'export function rewrite(value: any) { return value; }\n',
  };
  const handed = runWithBase(base, {
    'apps/web/src/rewrite.ts':
      "export function rewrite(value: any) { value.tenantId = 'tenant-victim'; }\n",
    'apps/web/src/attack.ts': [
      "import { kernelContext } from '../../../packages/database/src/kernel-context';",
      "import { rewrite } from './rewrite';",
      'export function attack() { rewrite(kernelContext); }',
    ].join('\n'),
  });
  assertRefused(
    handed,
    'C1',
    /module state .*#kernelContext .* is passed to changed code \(rewrite\)/u
  );

  const stored = runWithBase(base, {
    'apps/web/src/attack.ts': [
      "import { kernelContext } from '../../../packages/database/src/kernel-context';",
      'export const kept: any[] = [];',
      'export function attack() { kept.push(kernelContext); }',
    ].join('\n'),
  });
  assertRefused(stored, 'C1', /module state .*#kernelContext .* is passed to/u);
});

test('Q2: exported values of pinned kernel modules are state; schema values pass only to builders', () => {
  const pinnedBase = {
    'packages/database/src/db.ts': [
      "import { claims } from './schema';",
      'export const db: any = {};',
      'export const dbAdmin: any = {};',
      'export const dbRls: any = { claims };',
      "export const DEFAULT_CONTEXT = { tenantId: 'tenant-A' };",
    ].join('\n'),
    'packages/database/src/schema.ts':
      "export const users = {};\nexport const claims = { id: 'id' };\n",
    'apps/web/src/legacy-read.ts': [
      "import { withTenantContext } from '@interdomestik/database';",
      "export function read() { return withTenantContext({ tenantId: 'tenant-A' }, tx => tx.select()); }",
    ].join('\n'),
  };
  const clean = runWithBase(pinnedBase, {
    'apps/web/src/query.ts': [
      "import { claims } from '@interdomestik/database';",
      'export function load(tx: any) {',
      '  const columns = { id: claims.id };',
      '  return tx.select(columns).from(claims);',
      '}',
    ].join('\n'),
  });
  assert.deepEqual(clean.violations, []);
  assert.ok(clean.tenantState.includes('packages/database/src/db.ts#DEFAULT_CONTEXT'));

  const misuse = runWithBase(pinnedBase, {
    'apps/web/src/query.ts': [
      "import { claims } from '@interdomestik/database';",
      "import { DEFAULT_CONTEXT } from '@interdomestik/database/db';",
      'export function load(tx: any, sink: any) {',
      '  sink(claims);',
      "  DEFAULT_CONTEXT.tenantId = 'tenant-victim';",
      '  return tx.select().from(claims);',
      '}',
    ].join('\n'),
  });
  assertRefused(
    misuse,
    'C1',
    /module state packages\/database\/src\/schema.ts#claims .* is passed to a callee taken from the parameters/u
  );
  assertRefused(
    misuse,
    'C1',
    /module state packages\/database\/src\/db.ts#DEFAULT_CONTEXT .* is written by changed code/u
  );
});

// ---- Q2-r: a schema value reaches only recognized query-builder receivers ---------------------

const RECEIVER_BASE = {
  'packages/database/src/db.ts': [
    "import { claims } from './schema';",
    'export const db: any = {};',
    'export const dbAdmin: any = {};',
    'export const dbRls: any = { claims };',
  ].join('\n'),
  'packages/database/src/schema.ts':
    "export const users = {};\nexport const claims = { id: 'id' };\n",
  'apps/web/src/legacy-read.ts': [
    "import { withTenantContext } from '@interdomestik/database';",
    "export function read() { return withTenantContext({ tenantId: 'tenant-A' }, tx => tx.select()); }",
  ].join('\n'),
};
// Changed code holds only withTenantAuthority; the legacy entries appear in unchanged code.
const receiverRun = lines =>
  runWithBase(RECEIVER_BASE, { 'apps/web/src/receiver.ts': lines.join('\n') });
const IMPORTS = [
  "import { claims } from '@interdomestik/database';",
  "import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';",
];
const inTransaction = body => [
  ...IMPORTS,
  'export function attack(authority: any) {',
  '  return withTenantAuthority(authority, (tx: any) => {',
  ...body,
  '  });',
  '}',
];

test('Q2-r: kernel clients, kernel transactions and their facades are recognized receivers', () => {
  const lines = [
    "import { claims, db, withTenantContext } from '@interdomestik/database';",
    "import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';",
    'export function direct() { return db.select().from(claims).where(claims.id); }',
    'export function nested(authority: any) {',
    '  return withTenantAuthority(authority, tx => tx.transaction(inner => inner.insert(claims)));',
    '}',
    'function helper(executor: any, { scope }: any) {',
    '  let query = executor.select().from(claims);',
    '  query = query.where(claims.id);',
    '  return scope.update(claims);',
    '}',
    'export function viaHelper(authority: any) {',
    '  return withTenantContext(authority, tx => helper(tx, { scope: tx }));',
    '}',
    'function hookTx(tx: any) { return { insert: tx.insert.bind(tx), select: tx.select.bind(tx) }; }',
    'export function facade(authority: any) {',
    '  return withTenantAuthority(authority, tx => hookTx(tx).insert(claims));',
    '}',
    'function run(action: any) { return withTenantAuthority({}, action); }',
    'export function runner() { return run((scoped: any) => scoped.select().from(claims)); }',
  ];
  const result = runWithBase({ ...RECEIVER_BASE, 'apps/web/src/receiver.ts': lines.join('\n') });
  assert.deepEqual(result.violations, []);
});

test('Q2-r: a hostile receiver is refused however the schema value reaches it', () => {
  const unknown = /#claims .* is handed to an unknown receiver/u;
  const cases = {
    literal: [
      unknown,
      'const hostile = { from(table: any) { table.id = 1; } };',
      'hostile.from(claims);',
    ],
    map: [unknown, 'new Map().set(claims, 1);'],
    let: [unknown, 'let r: any = tx;', 'r = { from() {} };', 'r.from(claims);'],
    facade: [
      unknown,
      'const f = { insert: tx.insert.bind(tx), from: (t: any) => t };',
      'f.from(claims);',
    ],
    // Not a builder method: a container changed code builds keeps the value.
    store: [
      /#claims .* is passed to a callee built by changed code/u,
      'new Set<any>().add(claims);',
    ],
    assign: [
      /#claims .* is passed to a global callee that may keep or change it \(Object.assign\)/u,
      'Object.assign(claims, { id: 1 });',
    ],
  };
  for (const [name, [pattern, ...body]] of Object.entries(cases)) {
    const result = receiverRun(inTransaction(body));
    assert.ok(result.violations.length > 0, name);
    assertRefused(result, 'C1', pattern);
  }
});

test('Q2-r: helper parameters bind their callers, defaults and hand-offs', () => {
  const helper = 'function load(r: any) { return r.select().from(claims); }';
  const hostileCaller = receiverRun([
    ...IMPORTS,
    helper,
    'export const x = load({ select() {} });',
  ]);
  assertRefused(hostileCaller, 'C1', /query receiver: an unknown receiver .* reaches .*#load/u);

  const hostileDefault = receiverRun([
    ...IMPORTS,
    'export function load(r: any = { from() {} }) { return r.from(claims); }',
  ]);
  assertRefused(hostileDefault, 'C1', /query receiver: an unknown receiver .* reaches .*#load/u);

  const stored = receiverRun([...IMPORTS, helper, 'export const saved = [load];']);
  assertRefused(stored, 'C1', /query receiver: a callback handed on .* reaches .*#load/u);

  const callback = receiverRun([
    ...IMPORTS,
    'function run(cb: any) { return cb({ from() {} }); }',
    'export const x = run((tx: any) => tx.from(claims));',
  ]);
  assertRefused(callback, 'C1', /query receiver: an unknown receiver .* reaches .*#run/u);

  const member = receiverRun([
    ...IMPORTS,
    'function run(args: any) { return args.after({ from() {} }); }',
    'export const x = run({ after: (tx: any) => tx.from(claims) });',
  ]);
  assertRefused(member, 'C1', /query receiver: an unknown receiver .* reaches .*#run/u);

  const escaped = receiverRun([
    ...IMPORTS,
    'let kept: any;',
    'function run(args: any) { kept = args; }',
    'export const x = run({ after: (tx: any) => tx.from(claims) });',
  ]);
  assertRefused(escaped, 'C1', /query receiver: a callback carrier handed on .* reaches .*#run/u);

  const injected = receiverRun([
    ...IMPORTS,
    'function core(deps: any) {',
    '  const runner = deps.run ?? withTenantAuthority;',
    '  return runner({}, (tx: any) => tx.from(claims));',
    '}',
    'export const x = core({ run: (_: any, cb: any) => cb({ from() {} }) });',
  ]);
  assertRefused(injected, 'C1', /query receiver: an unknown receiver .* reaches/u);
});

test('Q2-r2: a spread or computed key never hides an earlier or overriding receiver', () => {
  const unknown = /#claims .* is handed to an unknown receiver/u;
  const cases = {
    // `...{}` carries no `r`, so the earlier hostile `r` is the value.
    emptySpread: ['const holder: any = { r: { from() {} }, ...{} };', 'holder.r.from(claims);'],
    spreadOfSafe: [
      'const holder: any = { r: { from() {} }, ...{ other: tx } };',
      'holder.r.from(claims);',
    ],
    computed: [
      "const key: string = 'r';",
      'const holder: any = { r: tx, [key]: { from() {} } };',
      'holder.r.from(claims);',
    ],
  };
  for (const [name, body] of Object.entries(cases)) {
    const result = receiverRun(inTransaction(body));
    assert.ok(result.violations.length > 0, name);
    assertRefused(result, 'C1', unknown);
  }
  // A spread that does carry a recognized `r` over an earlier hostile one is still checked
  // through the earlier one too: either may be the value when the spread's shape is unknown.
  const layered = receiverRun(
    inTransaction([
      'const carrier: any = { r: tx };',
      'const holder: any = { r: { from() {} }, ...carrier };',
      'holder.r.from(claims);',
    ])
  );
  assertRefused(layered, 'C1', unknown);
  const overridden = receiverRun(
    inTransaction([
      'const holder: any = { ...{ r: { from() {} } }, r: tx };',
      'holder.r.from(claims);',
    ])
  );
  assert.deepEqual(overridden.violations, []);

  const injected = receiverRun([
    ...IMPORTS,
    'function core(deps: any) {',
    '  const runner = deps.run ?? withTenantAuthority;',
    '  return runner({}, (tx: any) => tx.from(claims));',
    '}',
    'export const x = core({ run: (_: any, cb: any) => cb({ from() {} }), ...{} });',
  ]);
  assertRefused(injected, 'C1', /query receiver: an unknown receiver .* reaches/u);
});

const CUSTODY_BASE = {
  'apps/web/src/contexts.ts': [
    "import { withTenantContext } from '@interdomestik/database';",
    "export const CONTEXTS: any = [{ tenantId: 'tenant-A' }];",
    "export const CONFIG: any = { base: { hosts: ['a.example'] } };",
    "export const IDS = ['tenant-A', 'tenant-B'] as const;",
    'export function readFirst() {',
    '  return withTenantContext({ tenantId: CONTEXTS[0].tenantId || CONFIG.base || IDS[0] }, tx => tx.select());',
    '}',
  ].join('\n'),
};
const custody = body =>
  runWithBase(CUSTODY_BASE, {
    'apps/web/src/attack.ts': [
      "import { CONFIG, CONTEXTS, IDS } from './contexts';",
      'export function attack() {',
      ...body,
      '}',
    ].join('\n'),
  });

test('Q3-r2: changed code may not reach tracked members through globals, copies, iteration or operands', () => {
  const cases = {
    arrayFrom: [
      /#CONTEXTS .* is passed to a global callee that may keep or change it \(Array.from\)/u,
      "Array.from(CONTEXTS, (item: any) => { item.tenantId = 'tenant-victim'; return item; });",
    ],
    values: [
      /#CONTEXTS .* is passed to a global callee .*\(Object.values\)/u,
      "Object.values(CONTEXTS)[0].tenantId = 'tenant-victim';",
    ],
    objectCopy: [
      /#CONFIG .* is copied or iterated by changed code while its members are not primitives/u,
      'const copy = { ...CONFIG };',
      "copy.base.hosts.push('evil.example');",
    ],
    arrayCopy: [
      /#CONTEXTS .* is copied or iterated by changed code/u,
      "[...CONTEXTS][0].tenantId = 'tenant-victim';",
    ],
    iteration: [
      /#CONTEXTS .* is copied or iterated by changed code/u,
      "for (const item of CONTEXTS) item.tenantId = 'tenant-victim';",
    ],
    operand: [
      /#CONFIG .* escapes/u,
      'const same = CONFIG ?? {};',
      "same.base = { hosts: ['evil.example'] };",
    ],
  };
  for (const [name, [pattern, ...body]] of Object.entries(cases)) {
    const result = custody(body);
    assert.ok(result.violations.length > 0, name);
    assertRefused(result, 'C1', pattern);
  }
  // A copy of primitives detaches nothing that is tracked, and a key loop yields strings.
  const primitives = custody([
    'const ids = [...IDS];',
    'for (const key in CONFIG) ids.push(key as any);',
    'return ids.length > 0 && CONTEXTS.length > 0;',
  ]);
  assert.deepEqual(primitives.violations, []);
});

test('Q3: literal computed mutators, custom methods and opaque members are refused from changed code', () => {
  const base = {
    'apps/web/src/contexts.ts': [
      "import { withTenantContext } from '@interdomestik/database';",
      "export const CONTEXTS: any = [{ tenantId: 'tenant-A' }];",
      'export const ALIAS = CONTEXTS;',
      'export function readFirst() {',
      '  return withTenantContext(CONTEXTS[0], tx => tx.select());',
      '}',
    ].join('\n'),
  };
  const result = runWithBase(base, {
    'apps/web/src/attack.ts': [
      "import { ALIAS, CONTEXTS } from './contexts';",
      'export function attack(name: string, input: any) {',
      "  CONTEXTS['unshift']({ tenantId: 'tenant-victim' });",
      '  CONTEXTS.retarget(input);',
      '  CONTEXTS[name](input);',
      "  ALIAS.push({ tenantId: 'tenant-victim' });",
      '}',
    ].join('\n'),
  });
  assertRefused(result, 'C1', /#CONTEXTS .* is mutated by changed code \(unshift\)/u);
  assertRefused(
    result,
    'C1',
    /#CONTEXTS .* is called by changed code \(retarget\) without a read-only contract/u
  );
  assertRefused(result, 'C1', /#CONTEXTS .* is called through a computed member/u);
  assertRefused(result, 'C1', /#ALIAS .* is mutated by changed code \(push\)/u);
});

test('Q3: a source-bound read-only contract admits only its path while its declaration is unchanged', () => {
  const base = {
    'apps/web/src/contexts.ts': [
      "import { withTenantContext } from '@interdomestik/database';",
      "export const CONTEXTS: any = [{ tenantId: 'tenant-A' }];",
      'export function readFirst() { return withTenantContext(CONTEXTS[0], tx => tx.select()); }',
    ].join('\n'),
  };
  const declaration = "export const CONTEXTS: any = [{ tenantId: 'tenant-A' }];";
  const unit = parseSource('apps/web/src/contexts.ts', declaration);
  const contract = {
    key: 'apps/web/src/contexts.ts#CONTEXTS',
    paths: ['find'],
    sha256: sha256(fingerprint(unit.statements[0], unit)),
  };
  const evaluateWith = (changes, stateContracts) => {
    const trusted = new Map(Object.entries({ ...KERNEL, ...base }));
    const sources = new Map(trusted);
    for (const [path, text] of Object.entries(changes)) sources.set(path, text);
    const graph = createModuleGraph({
      sources,
      packages: PACKAGES,
      appAliases: [['@/', 'apps/web/src/']],
    });
    return evaluate({
      sources,
      trusted,
      graph,
      contracts: [],
      legacyPins: pinsOf(trusted),
      stateContracts,
    });
  };
  const reader = {
    'apps/web/src/reader.ts': [
      "import { CONTEXTS } from './contexts';",
      'export function first(id: string) { return CONTEXTS.find((entry: any) => entry.tenantId === id) ? id : null; }',
    ].join('\n'),
  };
  assertRefused(
    evaluateWith(reader, []),
    'C1',
    /is called by changed code \(find\) without a read-only contract/u
  );
  assert.deepEqual(evaluateWith(reader, [contract]).violations, []);
  // A contract reviewed against other declaration text admits nothing.
  const stale = evaluateWith(reader, [{ ...contract, sha256: sha256('reviewed elsewhere') }]);
  assertRefused(stale, 'C1', /is called by changed code \(find\) without a read-only contract/u);
  // A contract for another path admits nothing either.
  assertRefused(
    evaluateWith(reader, [{ ...contract, paths: ['some'] }]),
    'C1',
    /\(find\) without a read-only contract/u
  );
});

test('Q3-r: an escape contract admits the escape only while its reviewed consumers alone call it', () => {
  const hosts = [
    "import { withTenantContext } from '@interdomestik/database';",
    "const HOSTS: any = ['a.example'];",
    'export function getHosts() { return { allowed: HOSTS }; }',
    'export function readFirst() { return withTenantContext({ tenantId: HOSTS[0] }, tx => tx.select()); }',
  ].join('\n');
  const config = [
    "import { getHosts } from './hosts';",
    'export const config = { base: getHosts() };',
  ].join('\n');
  const base = { 'apps/web/src/hosts.ts': hosts, 'apps/web/src/config.ts': config };
  const printOf = (file, text, name) => {
    const sourceFile = parseSource(file, text);
    const [unit] = collectUnits(sourceFile).filter(each => unitName(each, sourceFile) === name);
    return sha256(fingerprint(unit, sourceFile));
  };
  const escape = {
    file: 'apps/web/src/hosts.ts',
    unit: 'getHosts',
    sha256: printOf('apps/web/src/hosts.ts', hosts, 'getHosts'),
    consumers: [
      {
        file: 'apps/web/src/config.ts',
        unit: 'config',
        sha256: printOf('apps/web/src/config.ts', config, 'config'),
      },
    ],
  };
  const contract = { key: 'apps/web/src/hosts.ts#HOSTS', escapes: [escape] };
  const evaluateWith = (changes, stateContracts) => {
    const trusted = new Map(Object.entries({ ...KERNEL, ...base }));
    const sources = new Map(trusted);
    for (const [path, text] of Object.entries(changes)) sources.set(path, text);
    const graph = createModuleGraph({
      sources,
      packages: PACKAGES,
      appAliases: [['@/', 'apps/web/src/']],
    });
    return evaluate({
      sources,
      trusted,
      graph,
      contracts: [],
      legacyPins: pinsOf(trusted),
      stateContracts,
    });
  };
  const escapes = /module state apps\/web\/src\/hosts.ts#HOSTS .* escapes/u;

  assert.deepEqual(evaluateWith({}, [contract]).violations, []);
  assertRefused(evaluateWith({}, []), 'C1', escapes);
  // An escape that names no consumer is never admitted.
  const { consumers: _omitted, ...bare } = escape;
  assertRefused(evaluateWith({}, [{ ...contract, escapes: [bare] }]), 'C1', escapes);

  const thief = {
    'apps/web/src/attack.ts': [
      "import { getHosts } from './hosts';",
      "export function steal() { getHosts().allowed.push('evil.example'); }",
    ].join('\n'),
  };
  assertRefused(evaluateWith(thief, [contract]), 'C1', escapes);
  const handle = {
    'apps/web/src/attack.ts':
      "import { getHosts } from './hosts';\nexport const kept = getHosts;\n",
  };
  assertRefused(evaluateWith(handle, [contract]), 'C1', escapes);
  // A consumer changed after review no longer binds the escape.
  const widened = {
    'apps/web/src/config.ts': config.replace('{ base: getHosts() }', '{ base: getHosts(), x: 1 }'),
  };
  assertRefused(evaluateWith(widened, [contract]), 'C1', escapes);
});

const WRAPPED_KERNEL = {
  'packages/database/src/wrap.ts': 'export function wrap<T>(fn: T): T { return fn; }\n',
  'packages/database/src/tenant.ts': [
    "import { dbRls } from './db';",
    "import { wrap } from './wrap';",
    'const begin = wrap(async (action: (tx: any) => unknown) => dbRls.transaction(action));',
    'export async function withTenantContext(context: unknown, action: (tx: any) => unknown) {',
    '  return begin(action);',
    '}',
    'export async function withTenantDb(context: unknown, action: (tx: any) => unknown) {',
    '  return withTenantContext(context, action);',
    '}',
  ].join('\n'),
};

test('Q4: the legacy pin binds wrappers, module initialization and every module in the import closure', () => {
  assert.deepEqual(runWithBase(WRAPPED_KERNEL).violations, []);
  const wrapper = runWithBase(WRAPPED_KERNEL, {
    'packages/database/src/wrap.ts':
      'export function wrap<T>(fn: T): T { return ((action: any) => (fn as any)(() => action)) as T; }\n',
  });
  assertRefused(wrapper, 'pin', /legacy kernel entry differs from its reviewed contract/u);
  const effect = runWithBase(WRAPPED_KERNEL, {
    'packages/database/src/tenant.ts': `${WRAPPED_KERNEL['packages/database/src/tenant.ts']}\n(globalThis as any).tenantOverride = 'tenant-victim';`,
  });
  assertRefused(effect, 'pin', /legacy kernel entry differs from its reviewed contract/u);
});

test('Q4: an unresolved or opaque kernel closure edge cannot be pinned', () => {
  const unresolved = runWithBase(
    {},
    {
      'packages/database/src/db.ts': `import './missing-kernel-module';\n${KERNEL['packages/database/src/db.ts']}`,
    },
    { repin: true }
  );
  assertRefused(
    unresolved,
    'pin',
    /legacy kernel closure cannot be bound: .*unresolved import \.\/missing-kernel-module/u
  );
  const opaque = runWithBase(
    {},
    {
      'packages/database/src/db.ts': `${KERNEL['packages/database/src/db.ts']}export const load = (name: string) => import(name);\n`,
    },
    { repin: true }
  );
  assertRefused(opaque, 'pin', /legacy kernel closure cannot be bound: .*non-literal specifier/u);
});

test('Q4: a changed wrapper taints an unchanged non-kernel declaration it wraps', () => {
  const base = {
    'apps/web/src/wrap.ts': 'export function wrap<T>(fn: T): T { return fn; }\n',
    'apps/web/src/picked.ts': [
      "import { withTenantContext } from '@interdomestik/database';",
      "import { wrap } from './wrap';",
      'const pick = wrap((session: any) => session.user.tenantId);',
      'export function read(session: any) { return withTenantContext({ tenantId: pick(session) }, tx => tx.select()); }',
    ].join('\n'),
  };
  const result = runWithBase(base, {
    'apps/web/src/wrap.ts':
      "export function wrap<T>(fn: T): T { return ((session: any) => 'tenant-victim') as T; }\n",
  });
  assertRefused(result, 'C1', /depends on changed code \(pick\)/u);
});

test('the owner pin is an exact commit and tree pair, and an unpinned comparator fails closed', async () => {
  const { TRUSTED } = await import('./tenant-guard/trusted.mjs');
  assert.ok(Object.isFrozen(TRUSTED));
  assert.match(TRUSTED.commit, /^[0-9a-f]{40}$/u);
  assert.match(TRUSTED.tree, /^[0-9a-f]{40}$/u);

  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const cli = fileURLToPath(new URL('./tenant-guard.mjs', import.meta.url));
  for (const override of ['859d5019a', 'HEAD', 'main']) {
    const run = spawnSync(process.execPath, [cli, '--trusted', override], { encoding: 'utf8' });
    assert.equal(run.status, 2, override);
    assert.match(run.stderr, /trusted comparator is not pinned/u);
  }
});

test('the S2 required workflow binds the same trusted pin and runs only the S2 entry', async () => {
  const fs = await import('node:fs');
  const { TRUSTED } = await import('./tenant-guard/trusted.mjs');
  const workflow = fs.readFileSync(
    new URL('../../.github/workflows/tenant-guard-s2-required.yml', import.meta.url),
    'utf8'
  );
  const pin = name => workflow.match(new RegExp(`^ {10}${name}='([0-9a-f]{40})'$`, 'mu'))?.[1];
  assert.equal(pin('trusted_commit'), TRUSTED.commit);
  assert.equal(pin('trusted_tree'), TRUSTED.tree);
  assert.match(pin('source_commit') ?? '', /^[0-9a-f]{40}$/u);
  assert.match(pin('source_tree') ?? '', /^[0-9a-f]{40}$/u);
  assert.match(workflow, /const pending = \['scripts\/ci\/tenant-guard\.mjs'\];/u);
  assert.match(workflow, /GIT_DIR="\$work\/git"/u);
  assert.doesNotMatch(workflow, /check-db-access-guard|db-access-baseline/u);
});

// U2-069 resolver binding: a candidate's resolution configuration is data the guard models, never
// a way to make a privileged module look like an external package.
const ADMIN_READ = ['export const read = () => dbAdmin.select();'];

test('a tsconfig path alias to the privileged database module is resolved, not external', () => {
  const attack = file(["import { dbAdmin } from 'db-alias';", ...ADMIN_READ]);
  const resolution = {
    pathRules: [{ pattern: 'db-alias', targets: ['packages/database/src/db.ts'] }],
    baseRoots: [],
  };
  assertRefused(run(attack, { resolution }), 'R-a', /dbAdmin is not available to this file/u);
  const wildcard = {
    pathRules: [{ pattern: '~db/*', targets: ['packages/database/src/*'] }],
    baseRoots: [],
  };
  assertRefused(
    run(file(["import { dbAdmin } from '~db/db';", ...ADMIN_READ]), { resolution: wildcard }),
    'R-a',
    /dbAdmin is not available to this file/u
  );
});

test('a baseUrl-relative bare import of the privileged module is resolved, not external', () => {
  const attack = file(["import { dbAdmin } from 'packages/database/src/db';", ...ADMIN_READ]);
  assertRefused(
    run(attack, { resolution: { pathRules: [], baseRoots: [''] } }),
    'R-a',
    /dbAdmin is not available to this file/u
  );
  // A bare name that reaches no workspace file under the root stays an external package.
  const external = run(file(["import { z } from 'zod';", 'export const s = z;']), {
    resolution: { pathRules: [], baseRoots: [''] },
  });
  assert.deepEqual(
    external.violations.filter(violation => violation.file === 'apps/web/src/attack.ts'),
    []
  );
});

test('a custom export condition cannot hide the privileged module behind a preferred one', () => {
  const packages = new Map(PACKAGES);
  packages.set('evil-db', {
    name: 'evil-db',
    dir: 'packages/database',
    exports: { '.': { 'evil-condition': './src/db.ts', import: './src/schema.ts' } },
    main: null,
  });
  assertRefused(
    run(file(["import { dbAdmin } from 'evil-db';", ...ADMIN_READ]), { packages }),
    'R-a',
    /dbAdmin is not available to this file/u
  );
});

test('resolution configs are parsed as data; unmodeled options, foreign extends and symlinks refuse', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { resolutionConfig, workspaceGlobViolations } =
    await import('./tenant-guard/resolution.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-guard-resolution-'));
  const write = (relative, text) => {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), text);
  };
  try {
    write(
      'tsconfig.json',
      '{ "compilerOptions": { "baseUrl": ".", "paths": { "~db/*": ["packages/database/src/*"] } } }'
    );
    // JSONC with comments, inheriting baseUrl and paths through a relative extends.
    write('packages/qa/tsconfig.json', '{\n  // inherits\n  "extends": "../../tsconfig.json",\n}');
    write(
      'apps/web/tsconfig.json',
      '{ "compilerOptions": { "baseUrl": ".", "paths": { "db-alias": ["../../packages/database/src/db.ts"] } } }'
    );
    write(
      'pnpm-workspace.yaml',
      'packages:\n  - apps/*\n  - packages/*\n\nallowBuilds:\n  esbuild: true\n'
    );
    const accepted = resolutionConfig(root);
    assert.deepEqual(accepted.violations, []);
    assert.deepEqual(accepted.baseRoots, ['', 'apps/web']);
    assert.deepEqual(
      accepted.pathRules.filter(rule => rule.pattern === 'db-alias'),
      [{ pattern: 'db-alias', targets: ['packages/database/src/db.ts'] }]
    );
    assert.equal(accepted.pathRules.filter(rule => rule.pattern === '~db/*').length, 2);
    assert.deepEqual(workspaceGlobViolations(root), []);

    write('packages/qa/tsconfig.json', '{ "extends": "@tsconfig/node20/tsconfig.json" }');
    write(
      'packages/ui/tsconfig.json',
      '{ "compilerOptions": { "rootDirs": ["src", "../database/src"] } }'
    );
    write('pnpm-workspace.yaml', 'packages:\n  - apps/*\n  - packages/*\n  - tools/*\n');
    const refused = resolutionConfig(root).violations.map(violation => violation.detail);
    assert.ok(
      refused.some(detail => /unsupported extends "@tsconfig/u.test(detail)),
      refused
    );
    assert.ok(
      refused.some(detail => /unmodeled resolver option rootDirs/u.test(detail)),
      refused
    );
    assert.match(workspaceGlobViolations(root)[0].detail, /workspace globs/u);

    fs.rmSync(path.join(root, 'packages/ui/tsconfig.json'));
    fs.symlinkSync(path.join(root, 'tsconfig.json'), path.join(root, 'packages/ui/tsconfig.json'));
    assert.throws(() => resolutionConfig(root), /incomplete: resolution config .* is not a file/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an executable bundler config is admitted only unchanged from the trusted tree', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const { bundlerConfigViolations } = await import('./tenant-guard/resolution.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-guard-bundler-'));
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  try {
    fs.mkdirSync(path.join(root, 'apps/web'), { recursive: true });
    fs.writeFileSync(path.join(root, 'apps/web/next.config.mjs'), 'export default {};\n');
    git('init', '-q');
    git('add', '.');
    git('commit', '-q', '-m', 'trusted');
    const commit = git('rev-parse', 'HEAD');
    assert.deepEqual(bundlerConfigViolations(root, commit), []);

    fs.writeFileSync(
      path.join(root, 'apps/web/next.config.mjs'),
      "export default { webpack: c => ({ ...c, resolve: { alias: { x: '../../packages/database/src/db.ts' } } }) };\n"
    );
    fs.writeFileSync(path.join(root, 'apps/web/next.config.ts'), 'export default {};\n');
    const changed = bundlerConfigViolations(root, commit).map(violation => violation.file);
    assert.deepEqual(changed, ['apps/web/next.config.mjs', 'apps/web/next.config.ts']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
