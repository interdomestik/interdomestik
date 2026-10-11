import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { createSourceModel } from './db-access-source.mjs';
import {
  ALIAS,
  SRC,
  fixtureModel,
  twinSources,
  twinParts,
} from './db-access-source-symbol-fixture.mjs';

test('model bindings keep original semantics across imports, defaults, namespaces and re-exports', () => {
  const n = fixtureModel();
  const { model } = n;
  const value = model.symbol(n.valueCall);
  assert.equal(value.flags & ALIAS, 0);
  assert.equal(value.valueDeclaration, n.valueDecl);
  assert.equal(model.symbol(n.valueCall), value);
  assert.equal(model.symbol(n.valueInit), value);
  assert.equal(model.declaration(n.valueCall), n.arrow);
  assert.equal(model.declaration(n.mainCall), n.mainFn);
  assert.equal(model.symbol(n.nsUse).valueDeclaration, n.aFile);
  assert.equal(model.declaration(n.nsUse), n.aFile);
  assert.equal(model.declaration(n.nsValue), n.arrow);
  assert.equal(model.symbol(n.renamedUse), value);
  assert.equal(model.declaration(n.renamedUse), n.arrow);
  assert.ok(ts.isShorthandPropertyAssignment(n.localShort.parent));
  assert.equal(model.symbol(n.localShort), model.symbol(n.localDecl.name));
  assert.equal(model.declaration(n.localShort), n.localDecl);
  const loop = model.symbol(n.loopUse);
  assert.notEqual(loop, undefined);
  assert.equal(loop.flags & ALIAS, 0);
  assert.equal(model.symbol(n.loopUse), loop);
  const eq = model.symbol(n.eqUse);
  assert.notEqual(eq, undefined);
  assert.equal(eq.flags & ALIAS, 0);
  assert.equal(model.symbol(n.eqUse), eq);
});

test('separate models never share symbols, ASTs or answers', () => {
  const first = createSourceModel(twinSources(1));
  const twin = createSourceModel(twinSources(1));
  const other = createSourceModel(twinSources(2));
  const p1 = twinParts(first);
  const p2 = twinParts(twin);
  const p3 = twinParts(other);
  const s1 = first.symbol(p1.use);
  assert.equal(first.declaration(p1.use), p1.arrow);
  assert.notEqual(p1.use, p2.use);
  assert.notEqual(p1.arrow, p2.arrow);
  const s2 = twin.symbol(p2.use);
  assert.notEqual(s2, s1);
  assert.equal(s2.valueDeclaration, p2.arrow.parent);
  assert.equal(twin.declaration(p2.use), p2.arrow);
  const s3 = other.symbol(p3.use);
  assert.notEqual(s3, s1);
  assert.equal(s3.valueDeclaration, p3.arrow.parent);
  assert.equal(other.declaration(p3.use), p3.arrow);
  assert.equal(p1.arrow.getText(), '() => 1');
  assert.equal(p3.arrow.getText(), '() => 2');
  assert.equal(first.symbol(p1.use), s1);
  assert.equal(first.declaration(p1.use), p1.arrow);
  assert.equal(first.fileOf(p1.use), twin.fileOf(p2.use));
});

test('ordered interleaving keeps identities and currently visible metadata', () => {
  const n = fixtureModel();
  const { model } = n;
  const aPath = `${SRC}a.ts`;
  const bPath = `${SRC}b.ts`;
  const valueSymbols = [];
  const eqSymbols = [];
  const steps = {
    raw: () => {
      assert.equal(model.rawDeclaration(n.valueCall), n.importSpecifier);
      assert.equal(model.rawDeclaration(n.eqUse), n.eqImport);
    },
    declaration: () => assert.equal(model.declaration(n.valueCall), n.arrow),
    symbol: () => {
      const item = model.symbol(n.valueCall);
      valueSymbols.push(item);
      assert.equal(item.valueDeclaration, n.valueDecl);
      assert.ok(item.declarations.includes(n.valueDecl));
    },
    exportValue: () => assert.equal(model.exportDeclaration(aPath, 'value'), n.arrow),
    exportRenamed: () => assert.equal(model.exportDeclaration(bPath, 'renamed'), n.arrow),
    exported: () => {
      const list = model.exportedDeclarations(aPath);
      assert.equal(list.length, 2);
      assert.ok(list.includes(n.arrow));
      assert.ok(list.includes(n.mainFn));
    },
    internalName: () => {
      assert.equal(model.externalName(n.valueCall), undefined);
      assert.equal(model.externalName(n.renamedUse), undefined);
    },
    externalName: () =>
      assert.deepEqual(model.externalName(n.eqUse), { module: 'drizzle-orm', name: 'eq' }),
    queryOperator: () => assert.equal(model.isQueryOperator(n.eqUse), true),
    eqSymbol: () => {
      const item = model.symbol(n.eqUse);
      eqSymbols.push(item);
      assert.notEqual(item, undefined);
      assert.equal(item.flags & ALIAS, 0);
    },
  };
  const order = [
    'raw',
    'declaration',
    'exportValue',
    'symbol',
    'internalName',
    'externalName',
    'queryOperator',
    'exported',
    'exportRenamed',
    'eqSymbol',
    'declaration',
    'symbol',
  ];
  for (const name of [...order, ...order.toReversed()]) steps[name]();
  assert.equal(valueSymbols.length, 4);
  assert.ok(valueSymbols.every(item => item === valueSymbols[0]));
  assert.equal(eqSymbols.length, 2);
  assert.equal(eqSymbols[0], eqSymbols[1]);
});
