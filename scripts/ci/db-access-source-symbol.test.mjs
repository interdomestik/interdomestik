import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import {
  ALIAS,
  count,
  assertCalls,
  compile,
  instrument,
  aliasFixture,
} from './db-access-source-symbol-fixture.mjs';

test('same-node lookups reuse the exact symbol and read the checker once per node', () => {
  const { checker, find } = compile({
    's.ts':
      'const x = 1;\nfunction f() {\n  const x = 2;\n  return x;\n}\nconst o = { x: 3 };\nx;\no.x;\nx;\n',
  });
  const s = find('s.ts');
  const innerUse = s('x', 2);
  const outerUseA = s('x', 4);
  const property = s('x', 5);
  const outerUseB = s('x', 6);
  const outer = checker.getSymbolAtLocation(outerUseA);
  const inner = checker.getSymbolAtLocation(innerUse);
  const prop = checker.getSymbolAtLocation(property);
  assert.equal(outer.valueDeclaration, s('x', 0).parent);
  assert.equal(inner.valueDeclaration, s('x', 1).parent);
  assert.ok(prop.declarations.includes(s('x', 3).parent));
  assert.notEqual(outer, inner);
  assert.notEqual(outer, prop);
  assert.notEqual(inner, prop);
  const lookups = instrument(checker);
  for (let round = 0; round < 3; round++) {
    assert.equal(lookups.symbol(outerUseA), outer);
    assert.equal(lookups.symbol(outerUseB), outer);
    assert.equal(lookups.symbol(innerUse), inner);
    assert.equal(lookups.symbol(property), prop);
  }
  // Equal text on distinct nodes keeps distinct entries: one underlying read per node.
  assertCalls(lookups.calls.location, [outerUseA, outerUseB, innerUse, property]);
  assertCalls(lookups.calls.aliased, []);
  assertCalls(lookups.calls.shorthand, []);
});

test('declaration shares the warm lexical symbol and keeps its own selection', () => {
  const { checker, find } = compile({
    'd.ts':
      'const arrow = () => 1;\nfunction named() {\n  return 2;\n}\nconst plain = 1;\narrow();\nnamed();\nplain;\n',
  });
  const s = find('d.ts');
  const arrowFn = s('arrow', 0).parent.initializer;
  const namedFn = s('named', 0).parent;
  const plainDecl = s('plain', 0).parent;
  const arrowUse = s('arrow', 1);
  const namedUse = s('named', 1);
  const plainUse = s('plain', 1);
  const lookups = instrument(checker);
  // Cold declaration first, then symbol: the declaration path warmed the shared memo.
  assert.equal(lookups.declaration(arrowUse), arrowFn);
  const arrowSymbol = lookups.symbol(arrowUse);
  assert.equal(arrowSymbol, checker.getSymbolAtLocation(arrowUse));
  assert.equal(arrowSymbol.valueDeclaration, arrowFn.parent);
  assert.equal(lookups.declaration(arrowUse), arrowFn);
  // Warm symbol first, then declaration.
  assert.equal(lookups.symbol(namedUse).valueDeclaration, namedFn);
  assert.equal(lookups.declaration(namedUse), namedFn);
  assert.equal(lookups.declaration(plainUse), plainDecl);
  assert.equal(lookups.declaration(plainUse), plainDecl);
  // isFunction fast path never consults the checker.
  assert.equal(lookups.declaration(arrowFn), arrowFn);
  assert.equal(lookups.declaration(namedFn), namedFn);
  assertCalls(lookups.calls.location, [arrowUse, namedUse, plainUse]);
  assertCalls(lookups.calls.aliased, []);
});

test('declaration reads symbol metadata live from the reused symbol object', () => {
  const { checker, find } = compile({ 'm.ts': 'function target() {}\nconst plain = 1;\nplain;\n' });
  const s = find('m.ts');
  const use = s('plain', 1);
  const plainDecl = s('plain', 0).parent;
  const fn = s('target', 0).parent;
  const live = { flags: 0, declarations: [plainDecl] };
  const lookups = instrument(checker, {
    location: node => (node === use ? live : checker.getSymbolAtLocation(node)),
  });
  assert.equal(lookups.declaration(use), plainDecl);
  live.valueDeclaration = fn;
  assert.equal(lookups.symbol(use), live);
  assert.equal(lookups.declaration(use), fn);
  delete live.valueDeclaration;
  live.declarations = [];
  assert.equal(lookups.declaration(use), undefined);
  assert.equal(lookups.symbol(use), live);
  assert.equal(Object.isFrozen(live), false);
  assertCalls(lookups.calls.location, [use]);
});

test('completed undefined answers are cached by presence, per node', () => {
  const { checker, find } = compile({ 'u.ts': 'const known = 1;\n1;\n1;\nmissing;\nknown;\n' });
  const s = find('u.ts');
  const literals = [
    s('1', 1, ts.SyntaxKind.NumericLiteral),
    s('1', 2, ts.SyntaxKind.NumericLiteral),
  ];
  assert.notEqual(literals[0], literals[1]);
  const missing = s('missing', 0);
  const known = s('known', 1);
  const missingExpected = checker.getSymbolAtLocation(missing);
  assert.equal(missingExpected === undefined || !(missingExpected.flags & ALIAS), true);
  // A resolvable node forced to a completed undefined answer proves presence, not truthiness.
  const lookups = instrument(checker, {
    location: node => (node === known ? undefined : checker.getSymbolAtLocation(node)),
  });
  for (let round = 0; round < 3; round++) {
    for (const node of literals) assert.equal(lookups.symbol(node), undefined);
    assert.equal(lookups.symbol(known), undefined);
    assert.equal(lookups.declaration(known), undefined);
    assert.equal(lookups.symbol(missing), missingExpected);
  }
  assertCalls(lookups.calls.location, [...literals, known, missing]);
  for (const node of [...literals, known, missing])
    assert.equal(count(lookups.calls.location, node), 1);
});

test('unresolved import aliases keep their original non-undefined answer', () => {
  const { checker, find } = compile({ 'x.ts': "import { gone } from './nowhere';\ngone;\n" });
  const use = find('x.ts')('gone', 1);
  const alias = checker.getSymbolAtLocation(use);
  assert.ok(alias.flags & ALIAS);
  const expected = checker.getAliasedSymbol(alias);
  assert.notEqual(expected, undefined);
  assert.equal(expected.flags & ALIAS, 0);
  const lookups = instrument(checker);
  for (let round = 0; round < 3; round++) assert.equal(lookups.symbol(use), expected);
  assertCalls(lookups.calls.location, [use]);
  assertCalls(lookups.calls.aliased, [alias]);
});

test('shorthand values and import aliases resolve as before, once per node', () => {
  const { checker, find } = compile({ 'sh.ts': 'const v = 1;\nconst o = { v };\n' });
  const s = find('sh.ts');
  const declName = s('v', 0);
  const short = s('v', 1);
  assert.ok(ts.isShorthandPropertyAssignment(short.parent));
  const expected = checker.getSymbolAtLocation(declName);
  assert.equal(expected.valueDeclaration, declName.parent);
  const lookups = instrument(checker);
  for (let round = 0; round < 3; round++) assert.equal(lookups.symbol(short), expected);
  assert.equal(lookups.declaration(short), declName.parent);
  assertCalls(lookups.calls.shorthand, [short.parent]);
  assert.equal(count(lookups.calls.location, short), 0);

  const f = aliasFixture();
  const aliasLookups = instrument(f.checker);
  for (let round = 0; round < 3; round++) {
    assert.equal(aliasLookups.symbol(f.bUse), f.target);
    assert.equal(aliasLookups.symbol(f.cUse), f.target);
  }
  assert.equal(aliasLookups.declaration(f.bUse), f.arrow);
  assertCalls(aliasLookups.calls.location, [f.bUse, f.cUse]);
  assertCalls(aliasLookups.calls.aliased, [f.aliasA, f.aliasB]);
});

test('controlled alias cycle completes as undefined and that answer is memoized', () => {
  const f = aliasFixture();
  const swap = item => {
    if (item === f.aliasA) return f.aliasB;
    if (item === f.aliasB) return f.aliasA;
    return f.checker.getAliasedSymbol(item);
  };
  const lookups = instrument(f.checker, { aliased: swap });
  assert.equal(lookups.symbol(f.bUse), undefined);
  assertCalls(lookups.calls.aliased, [f.aliasA, f.aliasB]);
  for (let round = 0; round < 3; round++) {
    assert.equal(lookups.symbol(f.bUse), undefined);
    assert.equal(lookups.declaration(f.bUse), undefined);
  }
  assertCalls(lookups.calls.location, [f.bUse]);
  assertCalls(lookups.calls.aliased, [f.aliasA, f.aliasB]);
  // A distinct node entering the same cycle is its own entry.
  assert.equal(lookups.symbol(f.cUse), undefined);
  assert.equal(lookups.symbol(f.cUse), undefined);
  assertCalls(lookups.calls.location, [f.bUse, f.cUse]);
  assertCalls(lookups.calls.aliased, [f.aliasA, f.aliasB, f.aliasB, f.aliasA]);
});

test('a cold lookup failure propagates exactly and is retried', () => {
  const f = aliasFixture();
  const failure = new Error('cold lookup failed');
  let armed = true;
  const lookups = instrument(f.checker, {
    location: node => {
      if (node === f.bUse && armed) {
        armed = false;
        throw failure;
      }
      return f.checker.getSymbolAtLocation(node);
    },
  });
  assert.throws(
    () => lookups.declaration(f.bUse),
    error => error === failure
  );
  assertCalls(lookups.calls.aliased, []);
  assert.equal(lookups.symbol(f.bUse), f.target);
  assert.equal(lookups.declaration(f.bUse), f.arrow);
  assert.equal(lookups.symbol(f.bUse), f.target);
  assertCalls(lookups.calls.location, [f.bUse, f.bUse]);
  assertCalls(lookups.calls.aliased, [f.aliasA]);
});

test('a failure after one alias step caches no partial result', () => {
  const f = aliasFixture();
  const failure = new Error('alias step failed');
  let armed = true;
  const lookups = instrument(f.checker, {
    aliased: item => {
      if (item === f.aliasA) return f.aliasB;
      if (item === f.aliasB && armed) {
        armed = false;
        throw failure;
      }
      return f.checker.getAliasedSymbol(item);
    },
  });
  assert.throws(
    () => lookups.symbol(f.bUse),
    error => error === failure
  );
  assertCalls(lookups.calls.aliased, [f.aliasA, f.aliasB]);
  assert.equal(lookups.symbol(f.bUse), f.target);
  assertCalls(lookups.calls.aliased, [f.aliasA, f.aliasB, f.aliasA, f.aliasB]);
  assert.equal(lookups.symbol(f.bUse), f.target);
  assert.equal(lookups.declaration(f.bUse), f.arrow);
  assertCalls(lookups.calls.location, [f.bUse, f.bUse]);
  assert.equal(lookups.calls.aliased.length, 4);
});

test('compiler alias cycle keeps the checker answer', () => {
  const { checker, find } = compile({
    'd.ts': "export { loop } from './e';\n",
    'e.ts': "export { loop } from './d';\n",
    'f.ts': "import { loop } from './d';\nloop;\n",
  });
  const use = find('f.ts')('loop', 1);
  const alias = checker.getSymbolAtLocation(use);
  assert.ok(alias.flags & ALIAS);
  const expected = checker.getAliasedSymbol(alias);
  assert.notEqual(expected, undefined);
  assert.equal(expected.flags & ALIAS, 0);
  const lookups = instrument(checker);
  for (let round = 0; round < 3; round++) assert.equal(lookups.symbol(use), expected);
  assertCalls(lookups.calls.location, [use]);
  assertCalls(lookups.calls.aliased, [alias]);
});
