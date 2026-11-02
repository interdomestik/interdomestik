import assert from 'node:assert/strict';
import test from 'node:test';
import { KERNEL, assertRefused, file, run } from './tenant-guard-test-support.mjs';

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
