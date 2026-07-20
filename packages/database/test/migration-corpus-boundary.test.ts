import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { inspect } from 'node:util';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import {
  readMigrationCorpusState,
  verifyCanonicalMigrationCorpus,
} from '../src/migration-corpus-capability';

const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url));
const PRODUCTION = [
  'migration-corpus-manifest.ts',
  'migration-corpus-contracts.ts',
  'migration-corpus-root.ts',
  'migration-corpus-node-fs.ts',
  'migration-corpus-directories.ts',
  'migration-corpus-files.ts',
  'migration-corpus-validator.ts',
  'migration-corpus-capability.ts',
] as const;
const TESTS = [
  'migration-corpus.test.ts',
  'migration-corpus-journal.test.ts',
  'migration-corpus-filesystem.test.ts',
  'migration-corpus-faults.test.ts',
  'migration-corpus-boundary.test.ts',
  'migration-corpus.support.ts',
] as const;

test('capability reflection, copies and forgeries reveal no state or authority', async () => {
  const result = await verifyCanonicalMigrationCorpus();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const capability = result.capability;
  const publicText = `${JSON.stringify(capability)} ${inspect(capability)} ${String(capability)}`;
  assert.equal(publicText.includes('drizzle'), false);
  assert.equal(publicText.includes('ced35bb'), false);
  assert.deepEqual(Object.getOwnPropertyNames(capability), []);
  assert.deepEqual(Object.getOwnPropertySymbols(capability), []);
  assert.deepEqual({ ...capability }, {});
  assert.ok(readMigrationCorpusState(capability));
  const clone = structuredClone(capability);
  assert.deepEqual(clone, {});
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  assert.equal(readMigrationCorpusState(revoked.proxy), null);
  for (const forgery of [
    {},
    clone,
    new Proxy(capability, {}),
    Object.create(Object.getPrototypeOf(capability)),
  ])
    assert.equal(readMigrationCorpusState(forgery), null);
  assert.ok(Object.isFrozen(capability));
  assert.ok(Object.isFrozen(Object.getPrototypeOf(capability)));
  assert.ok(Object.isFrozen(Object.getPrototypeOf(capability).constructor));
});

test('imports and syntax preserve the exact no-runtime boundary', async () => {
  const forbidden = new Set([
    'drizzle-orm',
    'postgres',
    'node:child_process',
    'node:http',
    'node:https',
    'node:net',
    'node:tls',
    'node:dns',
  ]);
  const validatorConsumers: string[] = [];
  const unwrapConsumers: string[] = [];
  const files = [
    ...PRODUCTION.map(name => join(PACKAGE_ROOT, 'src', name)),
    ...TESTS.map(name => join(PACKAGE_ROOT, 'test', name)),
  ];
  for (const path of files) {
    const production = path.includes('/src/migration-corpus-');
    const text = await readFile(path, 'utf8');
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const module = node.moduleSpecifier.text;
        assert.equal(forbidden.has(module), false, `${path}: ${module}`);
        if (module.endsWith('migration-corpus-validator')) validatorConsumers.push(path);
        const names = node.importClause?.namedBindings;
        if (
          names &&
          ts.isNamedImports(names) &&
          names.elements.some(item => item.name.text === 'readMigrationCorpusState')
        ) {
          unwrapConsumers.push(path);
        }
      }
      if (
        production &&
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'process'
      ) {
        assert.equal(['cwd', 'env'].includes(node.name.text), false, path);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const allowedValidator = new Set([
    join(PACKAGE_ROOT, 'src', 'migration-corpus-capability.ts'),
    ...TESTS.slice(0, 5).map(name => join(PACKAGE_ROOT, 'test', name)),
  ]);
  assert.ok(validatorConsumers.every(path => allowedValidator.has(path)));
  // prettier-ignore
  assert.deepEqual(unwrapConsumers, [join(PACKAGE_ROOT, 'test', 'migration-corpus-boundary.test.ts')]);
});

test('index exports and physical line ceilings stay closed', async () => {
  const index = await readFile(join(PACKAGE_ROOT, 'src', 'index.ts'), 'utf8');
  assert.equal(index.includes('migration-corpus'), false);
  const ceilings = [125, 125, 80, 125, 145, 149, 149, 125, 135, 145, 149, 149, 130, 149];
  const files = [...PRODUCTION, ...TESTS];
  for (let index = 0; index < files.length; index += 1) {
    const folder = index < PRODUCTION.length ? 'src' : 'test';
    const lines =
      (await readFile(join(PACKAGE_ROOT, folder, files[index]), 'utf8')).split('\n').length - 1;
    assert.ok(lines <= ceilings[index], `${files[index]}: ${lines} > ${ceilings[index]}`);
  }
});
