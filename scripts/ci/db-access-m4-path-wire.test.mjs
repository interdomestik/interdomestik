import assert from 'node:assert/strict';
import test from 'node:test';
import { validateM4PathDiagnostics } from './db-access-m4-path-wire.mjs';
import { pathFixture } from './db-access-m4-path-test-utils.mjs';

const validate = f => validateM4PathDiagnostics(f.batch, f.result, f.model);

test('nested selected identities share one path emission; old overlap and unrelated remainder stay separate', () => {
  const f = pathFixture(),
    before = structuredClone({ batch: f.batch, result: f.result });
  const path = validate(f);
  assert.equal(path, f.batch.pathDiagnostics);
  assert.equal(path.selections[0].observationKeys.length, 2);
  assert.equal(path.counters.selectedPathOccurrences, 3);
  assert.equal(path.counters.legacyOverlapOccurrences, 2);
  assert.equal(path.counters.additionalPathOccurrences, 1);
  assert.equal(path.counters.offPathOccurrences, 1);
  assert.equal(f.result.incompleteRawCount - path.counters.collectorFinalRawCount, 1);
  assert.deepEqual({ batch: f.batch, result: f.result }, before);
});

test('actual alternative evaluation frame and AST site stay distinct from traversal frame', () => {
  const f = pathFixture(),
    path = f.batch.pathDiagnostics;
  path.frames.push({ id: 'frame:1', status: 'unavailable' });
  Object.assign(path.scopes[0], {
    evaluationContext: 'frame:1',
    evaluationSite: f.locator(f.call),
    evaluationContextStatus: 'explicit-channel-context',
  });
  path.counters.storage.metadata++;
  validate(f);
  assert.notEqual(path.scopes[0].evaluationContext, path.scopes[0].traversalContext);
  path.scopes[0].evaluationSite[2]++;
  assert.throws(() => validate(f), /source locator/);
});

test('batch-local opaque frame identities are validated independently without cross-batch equivalence', () => {
  const a = pathFixture(),
    b = pathFixture();
  a.batch.pathDiagnostics.frames[0] = { id: 'frame:0', status: 'unavailable' };
  b.batch.pathDiagnostics.frames[0] = { id: 'frame:0', status: 'recursive' };
  validate(a);
  validate(b);
  assert.equal(a.batch.pathDiagnostics.frames[0].id, b.batch.pathDiagnostics.frames[0].id);
  assert.notDeepEqual(a.batch.pathDiagnostics.frames[0], b.batch.pathDiagnostics.frames[0]);
});

for (const [name, mutate] of [
  ['foreign selected observation', p => (p.selections[0].observationKeys[0] = 'foreign')],
  [
    'replayed selection key',
    p => p.selections[0].observationKeys.push(p.selections[0].observationKeys[0]),
  ],
  ['foreign root', p => (p.scopes[0].origin = 'foreign.ts')],
  ['foreign frame', p => (p.scopes[0].traversalContext = 'frame:foreign')],
  ['omitted overlap tag', p => (p.records[0].legacyDiagnosticKey = null)],
  ['foreign overlap tag', p => (p.records[0].legacyDiagnosticKey = 'f'.repeat(64))],
  ['replayed record', p => p.records.push(structuredClone(p.records[0]))],
  ['omitted original claim', p => p.records.pop()],
  ['counter-only progress', p => p.counters.additionalPathOccurrences++],
  ['foreign source position', p => p.scopes[0].emitterOwner[2]++],
  ['fake evaluation equivalence', p => (p.scopes[0].evaluationContext = null)],
  ['oversized encoded reserve', p => (p.counters.storage.encodedBytes = 64 * 1024 * 1024 + 1)],
  ['underreported encoded data', p => (p.counters.storage.encodedBytes = 1)],
  ['invented scope', p => p.scopes.push({ ...p.scopes[0], id: 'scope:1' })],
])
  test('path transport refuses ' + name, () => {
    const f = pathFixture();
    mutate(f.batch.pathDiagnostics);
    assert.throws(() => validate(f), /M4 path transport/);
  });

test('a path count must fit the exact original diagnostic key, including shared-key occurrences', () => {
  const f = pathFixture();
  f.result.incomplete[1].reason = 'unrelated';
  assert.throws(() => validate(f), /path count exceeds original/);
});

test('no selected path preserves off-path and unwrapped metadata without inventing applicability', () => {
  const f = pathFixture(),
    p = f.batch.pathDiagnostics;
  f.batch.attributions = [];
  f.batch.observations = [];
  p.selections = [];
  p.frames = [];
  p.scopes = [];
  p.records = [];
  Object.assign(p.counters, {
    selectedPathOccurrences: 0,
    legacyOverlapOccurrences: 0,
    additionalPathOccurrences: 0,
    offPathOccurrences: 4,
  });
  p.counters.storage = { encodedBytes: 0, scopes: 0, records: 0, metadata: 0 };
  validate(f);
  assert.equal(p.outsideScopeApplicability, 'unresolved');
  assert.equal(p.allExecutableContextsQualified, false);
  f.result.incomplete = null;
  assert.throws(() => validate(f), /original diagnostic array/);
});
