import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectMutationEffects } from './db-access-mutations.mjs';
import { createSourceModel } from './db-access-source.mjs';

// Real Map snapshots; only get() is observed so tests count source reads, never wallclock time.
class ObservedMap extends Map {
  reads = new Map();
  get(key) {
    this.reads.set(key, (this.reads.get(key) ?? 0) + 1);
    return super.get(key);
  }
}

const FILE = 'apps/web/src/example.ts';
const assignments = (count, prefix = 'flag') =>
  Array.from({ length: count }, (_, index) => `globalThis.${prefix}${index} = ${index};`).join(
    '\n'
  );

function observe(candidate, approved = candidate) {
  const sources = new ObservedMap(Object.entries(candidate));
  const approvedSources = new ObservedMap(Object.entries(approved));
  const model = createSourceModel(sources, approvedSources);
  for (const file of Object.keys(candidate)) assert.ok(model.parsed.has(file), file);
  sources.reads.clear();
  approvedSources.reads.clear();
  return { model, sources, approvedSources };
}
const reads = (map, file) => map.reads.get(file) ?? 0;
const environment = effects => [...effects.environmentChanges].sort();

test('unchanged source reads each fixed source once across many nodes', () => {
  const source = assignments(25);
  const { model, sources, approvedSources } = observe({ [FILE]: source });
  const effects = collectMutationEffects(model);
  assert.deepEqual(environment(effects), []);
  assert.equal(reads(approvedSources, FILE), 1);
  assert.equal(reads(sources, FILE), 1);
});

test('comment-only changes keep the same runtime fingerprint', () => {
  const approved = assignments(5);
  const candidate = `// reviewed\n/* note */ ${approved}`;
  const { model, sources, approvedSources } = observe({ [FILE]: candidate }, { [FILE]: approved });
  const effects = collectMutationEffects(model);
  assert.deepEqual(environment(effects), []);
  assert.equal(reads(approvedSources, FILE), 1);
  assert.equal(reads(sources, FILE), 1);
});

test('real executable changes are reported and cached as changed', () => {
  const approved = assignments(5);
  const candidate = approved.replace('flag0 = 0;', 'flag0 = 99;');
  assert.notEqual(candidate, approved);
  const { model, sources, approvedSources } = observe({ [FILE]: candidate }, { [FILE]: approved });
  const effects = collectMutationEffects(model);
  assert.deepEqual(environment(effects), [FILE]);
  assert.equal(reads(approvedSources, FILE), 1);
  assert.equal(reads(sources, FILE), 1);
});

test('missing approved source is changed and cached', () => {
  const { model, approvedSources } = observe({ [FILE]: assignments(8) }, {});
  const effects = collectMutationEffects(model);
  assert.deepEqual(environment(effects), [FILE]);
  assert.equal(reads(approvedSources, FILE), 1);
});

test('independent files keep separate true and false cache entries', () => {
  const changedFile = 'apps/web/src/changed.ts';
  const sameFile = 'apps/web/src/same.ts';
  const commentFile = 'apps/web/src/comment.ts';
  const newFile = 'apps/web/src/new.ts';
  const base = assignments(20);
  const { model, sources, approvedSources } = observe(
    {
      [changedFile]: base.replace('flag0 = 0;', 'flag0 = 7;'),
      [sameFile]: base,
      [commentFile]: `// note\n${base}`,
      [newFile]: base,
    },
    { [changedFile]: base, [sameFile]: base, [commentFile]: base }
  );
  const effects = collectMutationEffects(model);
  assert.deepEqual(environment(effects), [changedFile, newFile]);
  for (const file of [changedFile, sameFile, commentFile, newFile]) {
    assert.equal(reads(approvedSources, file), 1, file);
    assert.equal(reads(sources, file), 1, file);
  }
});

test('source read count does not grow with the number of nodes in a file', () => {
  for (const count of [1, 200]) {
    for (const changedSource of [false, true]) {
      const approved = assignments(count);
      const candidate = changedSource ? `${approved}\nglobalThis.extra = 1;` : approved;
      const { model, sources, approvedSources } = observe(
        { [FILE]: candidate },
        { [FILE]: approved }
      );
      const effects = collectMutationEffects(model);
      assert.deepEqual(environment(effects), changedSource ? [FILE] : [], `${count}`);
      assert.equal(reads(approvedSources, FILE), 1, `${count}`);
      assert.equal(reads(sources, FILE), 1, `${count}`);
    }
  }
});

test('source is resolved lazily only when a node needs the changed answer', () => {
  const { model, sources, approvedSources } = observe({ [FILE]: 'export const value = 1;' });
  const effects = collectMutationEffects(model);
  assert.deepEqual(environment(effects), []);
  assert.equal(reads(approvedSources, FILE), 0);
  assert.equal(reads(sources, FILE), 0);
});

test('same filename with different snapshots never shares a cached answer', () => {
  const approved = assignments(3);
  const unchanged = observe({ [FILE]: approved });
  const changedModel = observe(
    { [FILE]: `${approved}\nglobalThis.extra = 1;` },
    { [FILE]: approved }
  );
  assert.deepEqual(environment(collectMutationEffects(changedModel.model)), [FILE]);
  assert.deepEqual(environment(collectMutationEffects(unchanged.model)), []);
  assert.deepEqual(environment(collectMutationEffects(changedModel.model)), [FILE]);
  assert.deepEqual(environment(collectMutationEffects(unchanged.model)), []);
});

test('local variable mutations stay unsafe regardless of the cached changed answer', () => {
  const approved = 'let counter = 0;\ncounter = 1;\nglobalThis.flag = counter;';
  for (const candidate of [approved, approved.replace('counter = 1;', 'counter = 2;')]) {
    const { model } = observe({ [FILE]: candidate }, { [FILE]: approved });
    const effects = collectMutationEffects(model);
    assert.equal(effects.mutations.size, 1, candidate);
    assert.equal(effects.unsafeMutations.size, 1, candidate);
    assert.deepEqual(environment(effects), candidate === approved ? [] : [FILE], candidate);
  }
});

test('source read errors propagate instead of becoming unchanged or unknown', () => {
  const { model, approvedSources } = observe({ [FILE]: assignments(4) });
  approvedSources.get = key => {
    throw new Error(`approved read failed: ${key}`);
  };
  assert.throws(() => collectMutationEffects(model), /approved read failed/u);
});
