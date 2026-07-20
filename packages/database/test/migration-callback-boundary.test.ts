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
const PRODUCTION = [
  'migration-callback-plan-contracts.ts',
  'migration-callback-plan-manifest.ts',
  'migration-callback-source-verifier.ts',
  'migration-callback-plan-builder.ts',
  'migration-callback-plan-capability.ts',
  'migration-callback-plan.ts',
] as const;
const TESTS = [
  'migration-callback-plan.test.ts',
  'migration-callback-source.test.ts',
  'migration-callback-validation.test.ts',
  'migration-callback-boundary.test.ts',
  'migration-callback.support.ts',
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

test('imports, consumers and package exports keep the no-runtime boundary closed', async () => {
  const forbidden = [
    /^postgres(?:\/|$)/,
    /^node:(?:child_process|http|https|net|tls|dns)$/,
    /(?:^|\/)src\/migrate$/,
    /p0a0b/i,
    /sql-executor|migration-runner|provider-client/i,
  ];
  const unwrapConsumers: string[] = [];
  const corpusConsumers: string[] = [];
  const seamConsumers: string[] = [];
  const issuerConsumers: string[] = [];
  const drizzleImports: string[] = [];
  const paths = [
    ...PRODUCTION.map(name => join(ROOT, 'src', name)),
    ...TESTS.map(name => join(ROOT, 'test', name)),
  ];
  for (const path of paths) {
    const source = ts.createSourceFile(
      path,
      await readFile(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const module = node.moduleSpecifier.text;
        assert.equal(
          forbidden.some(pattern => pattern.test(module)),
          false,
          `${path}: ${module}`
        );
        if (module.startsWith('drizzle-orm')) drizzleImports.push(`${path}:${module}`);
        const names = node.importClause?.namedBindings;
        if (names && ts.isNamedImports(names))
          for (const item of names.elements) {
            if (item.name.text === 'readMigrationCallbackPlanState') unwrapConsumers.push(path);
            if (item.name.text === 'readMigrationCorpusState') corpusConsumers.push(path);
            if (item.name.text === 'testMigrationCallbackPlanWithDependencies')
              seamConsumers.push(path);
            if (item.name.text === 'issueMigrationCallbackPlanCapability')
              issuerConsumers.push(path);
          }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(unwrapConsumers, [join(ROOT, 'test', 'migration-callback-boundary.test.ts')]);
  assert.deepEqual(corpusConsumers, [join(ROOT, 'src', 'migration-callback-plan.ts')]);
  assert.deepEqual(seamConsumers, [join(ROOT, 'test', 'migration-callback-plan.test.ts')]);
  assert.deepEqual(issuerConsumers, [join(ROOT, 'src', 'migration-callback-plan.ts')]);
  assert.deepEqual(drizzleImports, [
    `${join(ROOT, 'test', 'migration-callback-plan.test.ts')}:drizzle-orm/pg-proxy/migrator`,
  ]);
  const index = await readFile(join(ROOT, 'src', 'index.ts'), 'utf8');
  assert.equal(index.includes('migration-callback'), false);
});

test('all exact files retain their accepted physical ceilings', async () => {
  const ceilings = [125, 80, 149, 149, 125, 125, 149, 149, 149, 149, 149];
  const files = [...PRODUCTION, ...TESTS];
  for (let index = 0; index < files.length; index += 1) {
    const folder = index < PRODUCTION.length ? 'src' : 'test';
    const lines = (await readFile(join(ROOT, folder, files[index]), 'utf8')).split('\n').length - 1;
    assert.ok(lines <= ceilings[index], `${files[index]}: ${lines} > ${ceilings[index]}`);
  }
});
