import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { createReferences } from './db-access-references.mjs';
import { createSourceModel } from './db-access-source.mjs';

const FILE = 'apps/web/src/example.ts';
const OTHER = 'apps/web/src/other.ts';
const LOCAL = [
  'import missingDefault, { original as renamed } from "./missing";',
  'import * as namespace from "@/missing";',
  'import { workspace } from "@interdomestik/missing";',
  'import { external } from "external-library";',
  'import { resolved } from "./resolved";',
  'missingDefault(); renamed(); original(); namespace.run(); workspace(); external(); resolved();',
].join('\n');

function fixture(source = LOCAL) {
  const model = createSourceModel(
    new Map([
      [FILE, source],
      [OTHER, 'import { renamed } from "external-library"; renamed();'],
      ['apps/web/src/resolved.ts', 'export function resolved() {}'],
    ])
  );
  const expressions = new Map();
  for (const [file, sf] of model.parsed)
    model.walk(sf, node => {
      if (ts.isCallExpression(node))
        expressions.set(`${file}:${node.expression.getText()}`, node.expression);
    });
  const walks = new Map();
  const walk = model.walk;
  model.walk = (node, callback) => {
    if (ts.isSourceFile(node)) walks.set(node, (walks.get(node) ?? 0) + 1);
    return walk(node, callback);
  };
  const references = createReferences(model, { isMutated: () => false });
  return { model, references, expressions, walks };
}

test('repeated local-import checks walk each source once and preserve unresolved edges', () => {
  const { model, references, expressions, walks } = fixture();
  const expected = {
    missingDefault: true,
    renamed: true,
    original: true, // Preserve the prior conservative treatment of every import-clause identifier.
    'namespace.run': true,
    workspace: true,
    external: false,
    resolved: false,
  };
  assert.equal(walks.size, 0);
  for (let iteration = 0; iteration < 80; iteration++) {
    for (const [name, local] of Object.entries(expected))
      assert.equal(references.localImport(expressions.get(`${FILE}:${name}`)), local, name);
    assert.equal(references.localImport(expressions.get(`${OTHER}:renamed`)), false);
  }
  assert.equal(walks.get(model.parsed.get(FILE)), 1);
  assert.equal(walks.get(model.parsed.get(OTHER)), 1);
});

test('cached source names do not cache symbol or executable-resolution decisions', () => {
  const { model, references, expressions, walks } = fixture();
  const expression = expressions.get(`${FILE}:renamed`);
  assert.equal(references.localImport(expression), true);
  const fn = model.parsed.get('apps/web/src/resolved.ts').statements[0];
  const originalSymbol = model.symbol;
  const originalDeclaration = model.declaration;
  model.symbol = node => (node === expression ? { declarations: [fn] } : originalSymbol(node));
  model.declaration = node => (node === expression ? fn : originalDeclaration(node));
  assert.equal(references.localImport(expression), false);
  model.symbol = originalSymbol;
  model.declaration = originalDeclaration;
  assert.equal(references.localImport(expression), true);
  assert.equal(walks.get(model.parsed.get(FILE)), 1);
});

test('same filename in separate parsed models cannot share local-import names', () => {
  const local = fixture();
  const external = fixture('import { renamed } from "external-library"; renamed();');
  for (const current of [local, external, local, external])
    assert.equal(
      current.references.localImport(current.expressions.get(`${FILE}:renamed`)),
      current === local
    );
});

test('interrupted import-name collection is retried and errors propagate', () => {
  const { model, references, expressions } = fixture();
  const expression = expressions.get(`${FILE}:renamed`);
  const walk = model.walk;
  model.walk = () => {
    throw new Error('source walk interrupted');
  };
  assert.throws(() => references.localImport(expression), /source walk interrupted/u);
  model.walk = walk;
  assert.equal(references.localImport(expression), true);
});
