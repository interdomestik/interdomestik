import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRefused, byStage, runWithBase } from './tenant-guard-test-support.mjs';

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
  // C1 accepts the hand-offs; L1 refuses the nested call that hands `work` a carrier it then
  // reads an inherited member of.
  assert.deepEqual(byStage(runWithBase(WORK_BASE)), {
    lifetime: ['readNested: work: a member the carrier does not own (select)'],
    other: [],
  });
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
