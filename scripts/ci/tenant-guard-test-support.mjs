import assert from 'node:assert/strict';
import test from 'node:test';
import { createModuleGraph } from './tenant-guard/modules.mjs';
import { evaluate } from './tenant-guard/rules.mjs';

// R-e adversarial fixtures for the tenant guard S″. Each negative is a failing source the guard
// must refuse; the baseline proves the same fixture tree is accepted when nothing changed.

export const KERNEL = {
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

export const PACKAGES = new Map([
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
export function pinsOf(trusted) {
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

export function run(changes = {}, { contracts = [], resolution, packages = PACKAGES } = {}) {
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

export function assertRefused(result, rule, pattern) {
  const match = result.violations.find(
    violation => violation.rule === rule && pattern.test(violation.detail)
  );
  assert.ok(
    match,
    `expected ${rule} ${pattern}; got ${JSON.stringify(result.violations, null, 2)}`
  );
}

export const file = body => ({ 'apps/web/src/attack.ts': body.join('\n') });

export function runWithBase(base, changes = {}, { repin = false } = {}) {
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
