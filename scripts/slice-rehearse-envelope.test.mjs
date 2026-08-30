import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveOperationalEnvelope } from './slice-rehearse-envelope.mjs';
import { canonicalJson, compareText, sha256 } from './slice-rehearse-canonical.mjs';

test('canonical ordering uses locale-independent UTF-16 code units', () => {
  assert.deepEqual(['ä', 'a', 'Z'].sort(compareText), ['Z', 'a', 'ä']);
});

test('canonical JSON is invariant to recursive object-key insertion order', () => {
  assert.equal(
    canonicalJson({ z: 1, a: { y: 2, b: [{ d: 4, c: 3 }] } }),
    canonicalJson({ a: { b: [{ c: 3, d: 4 }], y: 2 }, z: 1 })
  );
});

test('envelope binds proposal deltas and exact budget artifact instead of global ceilings', () => {
  const report = {
    sliceId: 'HARNESS-V2',
    authorityStops: [],
    deficits: [{ code: 'capacity:new-files', coveredBy: 'derived_capacity_rebind' }],
    repository: {
      baseSha: 'a'.repeat(40),
      origin: 'https://github.com/interdomestik/interdomestik',
    },
    writers: {
      digest: sha256('writers'),
      routineOperations: ['derived_capacity_rebind'],
    },
    capacity: {
      allocation: {
        id: 'harness-v2',
        mode: 'bounded',
        maxTrackedBytesDelta: 10,
        maxTrackedFilesDelta: 2,
        maxCategoryBytesDelta: { 'source/scripts': 10 },
        maxPathBytesDelta: { 'scripts/a.mjs': 10 },
      },
      budgetArtifact: { content: 'abc', sha256: sha256('abc'), utf8Bytes: 3 },
    },
    evidence: { proof: {} },
    operationalEnvelope: null,
    reportSha256: null,
  };
  assert.deepEqual(deriveOperationalEnvelope(report).capacity, {
    allocationId: 'harness-v2',
    mode: 'bounded',
    maxTrackedBytesDelta: 10,
    maxTrackedFilesDelta: 2,
    maxCategoryBytesDelta: { 'source/scripts': 10 },
    maxPathBytesDelta: { 'scripts/a.mjs': 10 },
    budgetArtifactSha256: sha256('abc'),
  });
});

test('an optional granted capacity rebind still binds the exact budget artifact', () => {
  const report = {
    sliceId: 'HARNESS-V2',
    authorityStops: [],
    deficits: [],
    repository: {
      baseSha: 'a'.repeat(40),
      origin: 'https://github.com/interdomestik/interdomestik',
    },
    writers: {
      digest: sha256('writers'),
      routineOperations: ['derived_capacity_rebind'],
    },
    capacity: {
      allocation: {
        id: 'harness-v2',
        mode: 'bounded',
        maxTrackedBytesDelta: 10,
        maxTrackedFilesDelta: 1,
        maxCategoryBytesDelta: { 'source/scripts': 10 },
        maxPathBytesDelta: { 'scripts/a.mjs': 10 },
      },
      budgetArtifact: { content: 'abc', sha256: sha256('abc'), utf8Bytes: 3 },
    },
    evidence: { proof: {} },
    operationalEnvelope: null,
    reportSha256: null,
  };
  assert.equal(deriveOperationalEnvelope(report).capacity.budgetArtifactSha256, sha256('abc'));
});

test('projection envelopes bind owners, path caps, and planned headroom', () => {
  const report = {
    sliceId: 'T117B-DATA',
    authorityStops: [],
    deficits: [],
    repository: {
      baseSha: 'a'.repeat(40),
      origin: 'https://github.com/interdomestik/interdomestik',
    },
    writers: { digest: sha256('writers'), routineOperations: [] },
    capacity: {
      allocation: { id: 'projection', mode: 'projection-existing' },
      projectionOwners: { 'docs/a.md': 'owner-a' },
      projectionPathCaps: { 'docs/a.md': 500 },
      projectionHeadroom: {
        bytes: 200,
        files: 0,
        categories: { 'docs/text': 200 },
        paths: { 'docs/a.md': 200 },
      },
    },
    evidence: { proof: {} },
    operationalEnvelope: null,
    reportSha256: null,
  };
  assert.deepEqual(deriveOperationalEnvelope(report).capacity.projectionHeadroom.paths, {
    'docs/a.md': 200,
  });
});
