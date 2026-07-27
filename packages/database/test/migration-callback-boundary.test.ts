import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { inspect } from 'node:util';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { verifyCanonicalMigrationCorpus } from '../src/migration-corpus-capability';
import { buildCanonicalMigrationCallbackPlan } from '../src/migration-callback-plan';
import { readMigrationCallbackPlanState } from '../src/migration-callback-plan-capability';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
// prettier-ignore
const PRODUCTION = [
  'migration-callback-plan-contracts.ts', 'migration-callback-plan-manifest.ts',
  'migration-callback-source-verifier.ts', 'migration-callback-plan-builder.ts',
  'migration-callback-plan-capability.ts', 'migration-callback-plan.ts',
  'migration-ledger-contracts.ts', 'migration-ledger-prefix.ts',
  'migration-ledger-catalog.ts', 'migration-ledger-lock.ts', 'migration-ledger-inspection.ts',
  'migration-execution-contracts.ts', 'migration-execution-bootstrap.ts',
  'migration-execution-plan.ts', 'migration-execution-kernel.ts',
] as const;
// prettier-ignore
const TESTS = [
  'migration-callback-plan.test.ts', 'migration-callback-source.test.ts',
  'migration-callback-validation.test.ts', 'migration-callback-boundary.test.ts',
  'migration-callback.support.ts', 'migration-ledger-prefix.test.ts',
  'migration-ledger-inspection.test.ts', 'migration-ledger-inspection-faults.test.ts',
  'migration-ledger-inspection.support.ts', 'migration-execution-kernel.test.ts',
  'migration-execution-faults.test.ts', 'migration-execution.support.ts',
  'migration-execution-boundary.test.ts',
  'migration-ledger-lock-order.test.ts',
] as const;

test('plan authority is private, redacted and rejects lookalikes', async () => {
  const corpus = await verifyCanonicalMigrationCorpus();
  assert.equal(corpus.ok, true);
  if (!corpus.ok) return;
  const result = await buildCanonicalMigrationCallbackPlan(corpus.capability);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const value = result.capability;
  const state = readMigrationCallbackPlanState(value);
  assert.ok(state);
  assert.equal(state.callbackItems.length, 843);
  const shown = `${inspect(value)} ${JSON.stringify(value)} ${String(value)}`;
  assert.equal(shown.includes('INSERT'), false);
  assert.equal(shown.includes(state.preCorpus.realRoot), false);
  const clone = structuredClone(value);
  for (const forgery of [
    {},
    clone,
    new Proxy(value, {}),
    Object.create(Object.getPrototypeOf(value)),
  ])
    assert.equal(readMigrationCallbackPlanState(forgery), null);
  assert.ok(Object.isFrozen(state.callbackItems));
});

test('imports, consumers, unsafe sink and package exports keep the boundary closed', async () => {
  const forbidden = [
    /^node:(?:child_process|http|https|net|tls|dns)$/,
    /(?:^|\/)src\/migrate$/,
    /p0a0b/i,
    /sql-executor|migration-runner|provider-client/i,
  ];
  const consumers = new Map<string, string[]>([
    ['readMigrationCallbackPlanState', []],
    ['readMigrationCorpusState', []],
    ['testMigrationCallbackPlanWithDependencies', []],
    ['issueMigrationCallbackPlanCapability', []],
  ]);
  const drizzleImports: string[] = [];
  const unsafeSinks: string[] = [];
  const paths = [
    ...PRODUCTION.map(name => join(ROOT, 'src', name)),
    ...TESTS.map(name => join(ROOT, 'test', name)),
  ];
  for (const path of paths) {
    const contents = await readFile(path, 'utf8');
    const source = ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true);
    if (path.includes('/src/') && contents.includes('.unsafe(')) unsafeSinks.push(path);
    if (path.includes('/src/migration-ledger-')) assert.doesNotMatch(contents, /\.unsafe\(/);
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const module = node.moduleSpecifier.text;
        const fixture = /migration-(?:ledger-inspection|execution)\.support\.ts$/.test(path);
        const boundary = path.endsWith('migration-execution-boundary.test.ts');
        const permittedPostgres =
          module === 'postgres' && (node.importClause?.isTypeOnly || fixture || boundary);
        assert.equal(
          forbidden.some(pattern => pattern.test(module)),
          false,
          `${path}: ${module}`
        );
        assert.equal(module === 'postgres' && !permittedPostgres, false, `${path}: ${module}`);
        if (module.startsWith('drizzle-orm')) drizzleImports.push(`${path}:${module}`);
        const names = node.importClause?.namedBindings;
        if (names && ts.isNamedImports(names))
          for (const item of names.elements) consumers.get(item.name.text)?.push(path);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(consumers.get('readMigrationCallbackPlanState'), [
    join(ROOT, 'src', 'migration-ledger-inspection.ts'),
    join(ROOT, 'src', 'migration-execution-plan.ts'),
    join(ROOT, 'test', 'migration-callback-boundary.test.ts'),
    join(ROOT, 'test', 'migration-ledger-inspection.support.ts'),
    join(ROOT, 'test', 'migration-execution.support.ts'),
  ]);
  assert.deepEqual(consumers.get('readMigrationCorpusState'), [
    join(ROOT, 'src', 'migration-callback-plan.ts'),
  ]);
  assert.deepEqual(consumers.get('testMigrationCallbackPlanWithDependencies'), [
    join(ROOT, 'test', 'migration-callback-plan.test.ts'),
  ]);
  assert.deepEqual(consumers.get('issueMigrationCallbackPlanCapability'), [
    join(ROOT, 'src', 'migration-callback-plan.ts'),
  ]);
  assert.deepEqual(unsafeSinks, [join(ROOT, 'src', 'migration-execution-kernel.ts')]);
  assert.deepEqual(drizzleImports, [
    `${join(ROOT, 'test', 'migration-callback-plan.test.ts')}:drizzle-orm/pg-proxy/migrator`,
  ]);
  const index = await readFile(join(ROOT, 'src', 'index.ts'), 'utf8');
  for (const boundary of ['migration-callback', 'migration-ledger', 'migration-execution'])
    assert.equal(index.includes(boundary), false);
});

test('all exact files retain their accepted physical ceilings', async () => {
  // prettier-ignore
  const ceilings = [
    125, 80, 149, 149, 125, 125, 110, 125, 149, 149, 149, 149, 149, 149,
    149, 149, 149, 149, 149, 149, 149, 149, 149, 149, 149, 149, 149, 149, 149,
  ];
  const files = [...PRODUCTION, ...TESTS];
  for (let index = 0; index < files.length; index += 1) {
    const folder = index < PRODUCTION.length ? 'src' : 'test';
    const lines = (await readFile(join(ROOT, folder, files[index]), 'utf8')).split('\n').length - 1;
    assert.ok(lines <= ceilings[index], `${files[index]}: ${lines} > ${ceilings[index]}`);
  }
});
