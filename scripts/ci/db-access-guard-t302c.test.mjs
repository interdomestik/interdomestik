import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTempRepo,
  readReport,
  runGuard,
  scan,
  writeFixture,
} from './db-access-guard-test-utils.mjs';

test('canonical aliases and lexical nested tenant transactions are approved', () => {
  const { result, report } = scan([
    'import { withTenantContext as scoped } from "@interdomestik/database";',
    'export function read(tenantId) { return scoped({tenantId}, async tx => {',
    'await tx.transaction(async nested => nested.select().from(user));',
    'return tx.query.user.findFirst({});',
    '}); }',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.newEntries.length, 3);
  assert.ok(report.newEntries.every(entry => entry.tenantPosture === 'tenant-context'));
});

test('same-name fake, shadowed callback and plain global transactions are rejected', () => {
  const cases = [
    [
      'function withTenantContext(c, fn) { return fn(db); }',
      'export function read(t){ return withTenantContext(t, async tx=>tx.select()); }',
    ],
    [
      'import { withTenantContext } from "@interdomestik/database";',
      'export function read(t){ return withTenantContext(t, async tx => { function nested(tx){ return tx.select(); } return nested(db); }); }',
    ],
    ['export function read(){ return db.transaction(async tx=>tx.select()); }'],
  ];
  for (const lines of cases) {
    const { result } = scan(['import { db } from "@interdomestik/database";', ...lines]);
    assert.equal(result.status, 1, lines.join('\n'));
  }
});

test('received tx helpers and forwarding are traced through each actual invocation', () => {
  const root = createTempRepo();
  writeFixture(root, 'apps/web/src/helper.ts', [
    'export function leaf(tx){ return tx.select().from(user); }',
    'export function forward(tx){ return leaf(tx); }',
  ]);
  writeFixture(root, 'apps/web/src/caller.ts', [
    'import { withTenantContext } from "@interdomestik/database";',
    'import { forward } from "./helper";',
    'export function read(t){ return withTenantContext(t, async tx => forward(tx)); }',
  ]);
  assert.equal(runGuard(root).status, 0);
  writeFixture(root, 'apps/web/src/unsafe.ts', [
    'import { db } from "@interdomestik/database";',
    'import { forward } from "./helper";',
    'export function unsafe(){ return forward(db); }',
  ]);
  assert.equal(runGuard(root).status, 1);
  assert.ok(readReport(root).failingNewEntries.some(entry => entry.file.endsWith('helper.ts')));
});

test('object received tx and destructured forwarding retain actual argument provenance', () => {
  const { result } = scan([
    'import { withTenantContext } from "@interdomestik/database";',
    'function leaf({tx}) { return tx.select().from(user); }',
    'function forward(params) { return leaf({tx:params.tx}); }',
    'export function read(t){ return withTenantContext(t, async tx=>forward({tx})); }',
  ]);
  assert.equal(result.status, 0, result.stderr);
});

test('default, wrong, escaped, reassigned and fallback clients never become received tenant tx', () => {
  for (const [helper, invocation] of [
    ['function leaf(tx = db){ return tx.select(); }', 'leaf(tx)'],
    ['function leaf(tx){ return tx.select(); }', 'leaf({})'],
    ['function leaf(tx){ return tx.select(); }', 'leaf(db)'],
    ['function leaf(tx){ tx = db; return tx.select(); }', 'leaf(tx)'],
    ['function leaf(tx){ return (tx ?? db).select(); }', 'leaf(tx)'],
    ['function leaf(tx){ return tx.select(); }', 'opaque(leaf)'],
  ]) {
    const { result } = scan([
      'import { db, withTenantContext } from "@interdomestik/database";',
      helper,
      `export function read(t){ return withTenantContext(t, async tx=>${invocation}); }`,
    ]);
    assert.equal(result.status, 1, helper + invocation);
  }
});

test('raw dbRls/dbAdmin are rejected even in API paths and with candidate directives', () => {
  for (const client of ['dbAdmin', 'dbRls']) {
    const { result, report } = scan(
      [
        `import { ${client} as raw } from "@interdomestik/database";`,
        '// db-access-guard: system-exempt -- reason: candidate API exception',
        'export function read(){ return raw.select().from(user); }',
      ],
      'apps/web/src/app/api/new/route.ts'
    );
    assert.equal(result.status, 1);
    assert.equal(report.failingNewEntries[0].tenantPosture, 'admin-privileged');
  }
});

test('claims transition prohibition survives aliases, schema-qualified targets and directives', () => {
  for (const target of ['claims', 'claimRows', 'schema.claims']) {
    const { result, report } = scan([
      'import { db, claims, claims as claimRows } from "@interdomestik/database";',
      'import * as schema from "@interdomestik/database/schema";',
      '// db-access-guard: tenant-scoped -- reason: candidate approval',
      `export function write(){ return db.update(${target}).set({status:"closed"}); }`,
    ]);
    assert.equal(result.status, 1);
    assert.ok(report.failingNewEntries.some(entry => entry.claimsUpdateTarget));
  }
});

test('type-only typeof method references are absent from executable operation inventory', () => {
  const { result, report } = scan([
    'import { db } from "@interdomestik/database";',
    'type Query = typeof db.query;',
    'type Update = ReturnType<typeof db.update>;',
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.scannedCount, 0);
});

test('const context/tx aliases and named re-export barrels preserve proven symbols', () => {
  const root = createTempRepo();
  writeFixture(
    root,
    'apps/web/src/tenant-barrel.ts',
    'export {withTenantContext as scoped} from "@interdomestik/database";'
  );
  writeFixture(root, 'apps/web/src/consumer.ts', [
    'import {scoped} from "./tenant-barrel";',
    'const run = scoped;',
    'export function read(t){return run(t,async tx=>{const exact = tx; return exact.select();});}',
  ]);
  assert.equal(runGuard(root).status, 0);
});

test('object mutation and escaping closures never inherit a completed callback transaction', () => {
  for (const lines of [
    [
      'function helper(params){params.tx = db; return params.tx.select();}',
      'export function read(t){return withTenantContext(t,async tx=>helper({tx}));}',
    ],
    ['export function read(t){return withTenantContext(t,async tx=>()=>tx.select());}'],
    [
      'export function read(t){return withTenantContext(t,async tx=>setTimeout(()=>tx.select(),1));}',
    ],
    [
      'export function read(t){return withTenantContext(t,async tx=>{const alias=tx;return ()=>alias.select();});}',
    ],
    [
      'export function read(t){return withTenantContext(t,async tx=>{const obj={tx};return ()=>obj.tx.select();});}',
    ],
    [
      'let saved; export function read(t){return withTenantContext(t,async tx=>{saved=tx;});} export function later(){return saved.select();}',
    ],
  ]) {
    const { result } = scan([
      'import {db,withTenantContext} from "@interdomestik/database";',
      ...lines,
    ]);
    assert.equal(result.status, 1, lines.join('\n'));
  }
});

test('withTenantDb and lone nested tx are safe; mixed ambient and type-only fake helpers are not', () => {
  const positive = scan([
    'import {withTenantDb} from "@interdomestik/database";',
    'export function read(t){return withTenantDb(t,async tx=>tx.transaction(async inner=>inner.select()));}',
  ]);
  assert.equal(positive.result.status, 0, positive.result.stderr);
  for (const helper of [
    'function leaf(tx){const safe=tx.select();return db.select();}',
    'function leaf(tx){return dbRls.select();}',
  ]) {
    const { result } = scan([
      'import {db,dbRls,withTenantContext} from "@interdomestik/database";',
      helper,
      'export function read(t){return withTenantContext(t,async tx=>leaf(tx));}',
    ]);
    assert.equal(result.status, 1);
  }
  const fake = scan([
    'import type {withTenantContext as ContextType} from "@interdomestik/database";',
    'function withTenantContext(c,fn){return fn({});}',
    'export function read(t){return withTenantContext(t,async tx=>tx.select());}',
  ]);
  assert.equal(fake.result.status, 1);
});
