import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRefused, runWithBase } from './tenant-guard-test-support.mjs';

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
