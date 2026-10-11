import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceLookups } from './db-access-mutation-source-lookups.mjs';
import { CASES } from './db-access-mutations-settlement-fixture.mjs';
import {
  FILE,
  SOURCES,
  assertReduced,
  declarations,
  failOnce,
  initializer,
  load,
  makeModel,
  observeDirect,
  observeFull,
  sets,
} from './db-access-mutations-static-fixture.mjs';

const [reference, candidate] = await Promise.all([load('reference'), load('candidate')]);
const { tree, imports, vendor, origin, record, shadow } = SOURCES;
const { ambient, local, items, fn, env } = SOURCES;
const reads = (count, read) => Array.from({ length: count }, read);
const using = (source, fewer = [], more = {}) => ({ source, fewer, ...more });
const failB = m => failOnce(m, 'symbol', 'partial failure', node => node.getText() === 'b');

// Each control runs on the frozen reference and the candidate. The ordered mutation, strict,
// environment and unknown sets plus the action's observations must be identical; the candidate may
// only do less model work, and strictly less where the control names a counter.
function direct(name, options, action) {
  test(`direct differential: ${name}`, () => {
    const spec = { ...options, action };
    const expected = observeDirect(reference, spec);
    const actual = observeDirect(candidate, spec);
    assert.deepEqual(actual.sets, expected.sets);
    assert.deepEqual(actual.extra, expected.extra);
    assertReduced(actual.stats, expected.stats, options.fewer);
  });
}

const tiered = using(tree, ['invalidations']);
direct('false-repeat-then-true-escalation', tiered, (m, r) => {
  const node = initializer(m, 'tree');
  r.__test.invalidate(node, false);
  const first = sets(m, r);
  for (let i = 0; i < 20; i++) r.__test.invalidate(node, false);
  r.__test.invalidate(node, true);
  const strict = sets(m, r);
  for (let i = 0; i < 20; i++) {
    r.__test.invalidate(node, false);
    r.__test.invalidate(node, true);
  }
  assert.equal(first.unsafe.length, 0);
  assert.equal(strict.unsafe.length, 3);
  return { first, strict };
});

direct('true-completion-subsumes-false', tiered, (m, r) => {
  const node = initializer(m, 'tree');
  r.__test.invalidate(node, true);
  for (let i = 0; i < 20; i++) r.__test.invalidate(node, false);
  assert.equal(r.unsafeMutations.size, 3);
});

direct('partial-error-then-strict-retry', using(tree), (m, r) => {
  failB(m);
  const node = initializer(m, 'tree');
  assert.throws(() => r.__test.invalidate(node, false), /partial failure/u);
  r.__test.invalidate(node, true);
  assert.equal(r.unsafeMutations.size, 3);
});

const retryTier = strict => (m, r) => {
  failB(m);
  const node = initializer(m, 'tree');
  assert.throws(() => r.__test.invalidate(node, strict), /partial failure/u);
  r.__test.invalidate(node, strict);
  assert.equal(r.mutations.size, 3);
  assert.equal(r.unsafeMutations.size, strict ? 3 : 0);
};
direct('partial-error-same-tier-retry-false', tiered, retryTier(false));
direct('partial-error-same-tier-retry-true', tiered, retryTier(true));

direct('same-AST-fresh-collection-isolation', using(tree), (m, r, implementation) => {
  const node = initializer(m, 'tree');
  r.__test.invalidate(node, true);
  const second = implementation.collectMutationEffects(m);
  assert.equal(second.mutations.size, 0);
  second.__test.invalidate(node, false);
  assert.equal(second.mutations.size, 3);
  assert.equal(second.unsafeMutations.size, 0);
  return sets(m, second);
});

direct('warmed-root-symbol-keeps-membership-live', using(record), (m, r) => {
  const [{ name }] = declarations(m, 'record');
  const targets = [name, initializer(m, 'prop'), initializer(m, 'index')];
  const read = () => targets.map(node => r.isMutated(node));
  const before = read();
  r.__test.invalidate(name, true);
  const after = read();
  assert.deepEqual(before, [false, false, false]);
  assert.deepEqual(after, [true, true, true]);
  return { before, after };
});

direct('shadowed-symbols-remain-distinct', using(shadow), (m, r) => {
  const names = declarations(m, 'item').map(node => node.name);
  assert.equal(names.length, 2);
  const before = names.map(name => r.isMutated(name));
  r.__test.invalidate(names[0], true);
  const after = names.map(name => r.isMutated(name));
  assert.deepEqual(after, [true, false]);
  return { before, after };
});

direct('symbol-failure-retry-and-negative-origin', using(ambient, ['symbols']), (m, r) => {
  const [{ name }] = declarations(m, 'local');
  failOnce(m, 'symbol', 'symbol failed');
  assert.throws(() => r.isMutated(name), /symbol failed/u);
  assert.equal(r.isMutated(name), false);
  r.__test.invalidate(name, true);
  assert.equal(r.isMutated(name), true);
  const unknown = initializer(m, 'ambient');
  return reads(6, () => r.isMutated(unknown));
});

direct('file-lookup-failure-retry', using(local, ['files']), (m, r) => {
  const node = initializer(m, 'local');
  failOnce(m, 'fileOf', 'file failed');
  assert.throws(() => r.__test.changed(node), /file failed/u);
  const result = reads(6, () => r.__test.changed(node));
  assert.deepEqual(result, Array(6).fill(false));
  return result;
});

direct('declaration-negative-cache-and-shadowing', using(items, ['declarations']), (m, r) => {
  const [a, b] = declarations(m, 'item').map(node => r.__test.declaration(node.name));
  assert.notEqual(a, b);
  const literal = initializer(m, 'literal');
  const answer = reads(6, () => r.__test.declaration(literal));
  assert.deepEqual(answer, Array(6).fill(undefined));
  return { a: a.pos, b: b.pos, answer };
});

direct('declaration-cold-error-retry', using(fn, ['declarations']), (m, r) => {
  const fnNode = m.parsed.get(FILE).statements[0];
  failOnce(m, 'declaration', 'declaration failed');
  assert.throws(() => r.__test.declaration(fnNode), /declaration failed/u);
  assert.equal(r.__test.declaration(fnNode), fnNode);
  assert.equal(r.__test.declaration(fnNode), fnNode);
});

direct('query-import-shapes-and-shadowed-binding', using(imports, ['queryOperators']), (m, r) => {
  const names = ['direct', 'indirect', 'property', 'namespace', 'foreign', 'unresolved', 'hidden'];
  const expected = [true, false, false, false, false, false, false];
  const read = () => names.map(name => r.__test.queryOperator(initializer(m, name)));
  const before = read();
  assert.deepEqual(before, expected);
  const after = read();
  assert.deepEqual(after, expected);
  assert.equal(r.__test.queryOperator(undefined), false);
  return { before, after };
});

direct('query-operator-cold-error-retry', using(imports, ['queryOperators']), (m, r) => {
  const node = initializer(m, 'direct');
  failOnce(m, 'isQueryOperator', 'query lookup failed');
  assert.throws(() => r.__test.queryOperator(node), /query lookup failed/u);
  assert.equal(r.__test.queryOperator(node), true);
  assert.equal(r.__test.queryOperator(node), true);
});

const denial = using(imports, [], { extra: vendor });
direct('cached-query-identity-keeps-mutation-denial-live', denial, (m, r) => {
  const node = initializer(m, 'direct');
  assert.equal(r.__test.queryOperator(node), true);
  assert.equal(r.isMutated(node), false);
  r.__test.invalidate(node, true);
  assert.equal(r.isMutated(node), true);
  assert.equal(r.__test.queryOperator(node), true);
  const admitted = r.__test.queryOperator(node) && !r.isMutated(node);
  assert.equal(admitted, false);
  return admitted;
});

const changedEnv = using(env, [], { approved: 'const old = 1;' });
const commentEnv = using(`// note\n${env}`, [], { approved: env });
direct('changed-global-alias-environment', changedEnv, (m, r) => {
  const data = initializer(m, 'data');
  r.__test.invalidate(data, false);
  r.__test.invalidate(data, true);
  r.__test.invalidate(data, false);
  assert.deepEqual([...r.environmentChanges], [FILE]);
});

direct('comment-only-global-alias-environment', commentEnv, (m, r) => {
  const data = initializer(m, 'data');
  r.__test.invalidate(data, false);
  r.__test.invalidate(data, true);
  assert.equal(r.environmentChanges.size, 0);
});

direct('top-level-origin-depth-warm-and-cold', using(origin, ['traces']), (m, r) => {
  const read = name => r.__test.externalOrigin(initializer(m, name));
  const shallow = read('a2');
  assert.equal(shallow.name, 'eq');
  const long = read('a71');
  assert.equal(long, undefined);
  const answers = [shallow, long, ...reads(9, (_, i) => read(`a${60 + i}`))];
  for (let i = 0; i < 5; i++) {
    assert.equal(read('a71'), undefined);
    assert.equal(read('cycleA'), undefined);
    assert.equal(read('missing'), undefined);
  }
  return answers;
});

direct('external-origin-exception-not-cached', using(origin), (m, r) => {
  failOnce(m, 'externalName', 'injected origin failure');
  const node = initializer(m, 'a0');
  assert.throws(() => r.__test.externalOrigin(node), /injected origin failure/u);
  const result = r.__test.externalOrigin(initializer(m, 'a0'));
  assert.equal(result.name, 'eq');
  return result;
});

// Eight ordered scenarios: every dispatch, mutation, unknown and frame is identical, the bounds
// still report their unknowns, and strict chains need strictly fewer symbol lookups.
const UNKNOWN = {
  'reverse-strict-34-dispatch-bound': ['dispatch-round-bound'],
  'reverse-strict-40-settlement-bound': ['mutation-dispatch-settlement-bound'],
};
const REDUCED = new Set([
  'reverse-strict-6',
  'reverse-strict-34-dispatch-bound',
  'reverse-strict-40-settlement-bound',
]);

for (const [name, sources] of CASES) {
  test(`full ordered snapshot: ${name}`, () => {
    const expected = observeFull(reference, sources);
    const actual = observeFull(candidate, sources);
    assert.deepEqual(actual.snapshot, expected.snapshot);
    assert.deepEqual(actual.snapshot.analysisUnknown, UNKNOWN[name] ?? []);
    assertReduced(actual.stats, expected.stats, REDUCED.has(name) ? ['symbols'] : []);
  });
}

test('production collection exposes no test-only hooks', async () => {
  const { collectMutationEffects } = await import('./db-access-mutations.mjs');
  const result = collectMutationEffects(makeModel('const a = 1;'));
  assert.equal('__test' in result, false);
  assert.equal(Object.keys(result).length, 8);
});

test('lookup factory caches undefined and false but never an exception', () => {
  const stubs = [
    ['symbol', 'sourceSymbol', undefined],
    ['fileOf', 'sourceFile', 'a.ts'],
    ['declaration', 'sourceDeclaration', undefined],
    ['isQueryOperator', 'sourceQueryOperator', false],
  ];
  const counts = {};
  const model = {};
  let failing = true;
  for (const [method, , answer] of stubs)
    model[method] = () => {
      counts[method] = (counts[method] ?? 0) + 1;
      if (failing) throw new Error(`${method} failed`);
      return answer;
    };
  const lookups = createSourceLookups(model);
  const node = {};
  for (const [method, read] of stubs)
    assert.throws(() => lookups[read](node), new RegExp(`${method} failed`, 'u'));
  failing = false;
  for (const [method, read, answer] of stubs) {
    for (let i = 0; i < 3; i++) assert.equal(lookups[read](node), answer);
    assert.equal(counts[method], 2, method);
  }
  assert.equal(lookups.sourceQueryOperator(undefined), false);
  assert.equal(counts.isQueryOperator, 3);
  assert.equal(createSourceLookups(model).sourceSymbol(node), undefined);
  assert.equal(counts.symbol, 3);
});
