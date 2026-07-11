import assert from 'node:assert/strict';
import test from 'node:test';

import { createFixtureRepository } from '../public/src/data/fixture-repository.mjs';
import {
  normalizeAssignment,
  normalizePacket,
  normalizeReviewer,
} from '../public/src/models/normalize-fixture.mjs';
import { normalizeDecision, normalizeDraft } from '../public/src/models/normalize-review.mjs';
import { assignments, fakeLoader, partA, reviewer } from './validation-fixtures.mjs';

test('filters assignments by reviewer fixture', async () => {
  const repository = createFixtureRepository({ loadJson: fakeLoader });
  const result = await repository.listAssignments(reviewer.id);
  assert.deepEqual(result, { ok: true, value: assignments });
});
test('loads a validated reviewer, packet, and assignment bundle', async () => {
  const repository = createFixtureRepository({ loadJson: fakeLoader });
  assert.deepEqual(await repository.loadReviewerProfile(reviewer.id), {
    ok: true,
    value: reviewer,
  });
  assert.equal((await repository.loadPacket(partA.id)).value.id, partA.id);
  const bundle = await repository.loadAssignmentBundle(assignments[0].id);
  assert.equal(bundle.ok, true);
  assert.equal(bundle.value.packet.id, partA.id);
});
test('returns stable missing and role-mismatch errors', async () => {
  const repository = createFixtureRepository({ loadJson: fakeLoader });
  assert.deepEqual(await repository.loadPacket('missing'), {
    ok: false,
    code: 'not_found',
    message: 'Mostra e paketës nuk u gjet.',
  });
  const mismatch = async path =>
    path.endsWith('mob-03a-part-a.json') ? { ...partA, reviewerRole: 'legal' } : fakeLoader(path);
  assert.deepEqual(
    await createFixtureRepository({ loadJson: mismatch }).loadAssignmentBundle(assignments[0].id),
    {
      ok: false,
      code: 'invalid_data',
      message: 'Rolet e detyrës, shqyrtuesit dhe paketës nuk përputhen.',
    }
  );
});
test('rejects a same-role packet whose ID disagrees with its assignment', async () => {
  const mismatch = async path =>
    path.endsWith('mob-03a-part-a.json') ? { ...partA, id: 'mob-03a-part-b' } : fakeLoader(path);
  const result = await createFixtureRepository({ loadJson: mismatch }).loadAssignmentBundle(
    assignments[0].id
  );
  assert.equal(result.code, 'invalid_data');
});
test('converts a packet loader failure into invalid_data', async () => {
  const brokenLoader = async () => Promise.reject(new Error('unavailable fixture'));
  assert.deepEqual(await createFixtureRepository({ loadJson: brokenLoader }).loadPacket(partA.id), {
    ok: false,
    code: 'invalid_data',
    message: 'Mostra e paketës është e pavlefshme.',
  });
});
test('returns invalid_data without falling back from an invalid suggestion', async () => {
  const loader = async path =>
    path.endsWith('mob-03a-part-a.json')
      ? { ...partA, items: [{ ...partA.items[0], suggestedReview: undefined }, partA.items[1]] }
      : fakeLoader(path);
  const result = await createFixtureRepository({ loadJson: loader }).loadPacket(partA.id);
  assert.deepEqual(result, {
    ok: false,
    code: 'invalid_data',
    message: 'Mostra e paketës është e pavlefshme.',
  });
});

test('normalizes complete records and rejects missing required fields', () => {
  assert.deepEqual(normalizeReviewer(reviewer), reviewer);
  assert.deepEqual(normalizeAssignment(assignments[0]), assignments[0]);
  assert.deepEqual(normalizePacket(partA).itemIds, partA.itemIds);
  assert.throws(() => normalizeReviewer({ ...reviewer, repoSafe: undefined }), /repoSafe/);
  assert.throws(() => normalizeAssignment({ ...assignments[0], dueDate: undefined }), /dueDate/);
  assert.throws(() => normalizePacket({ ...partA, items: [{ id: 'missing' }] }), /prompt/);
});

test('rejects wrong field and descriptor types', () => {
  assert.throws(() => normalizeReviewer({ ...reviewer, id: 1 }), /id.*string/);
  assert.throws(() => normalizeAssignment({ ...assignments[0], dueDate: 1 }), /dueDate.*string/);
  assert.throws(() => normalizePacket({ ...partA, version: 1 }), /version.*string/);
  assert.throws(
    () => normalizePacket({ ...partA, items: [{ ...partA.items[0], requiredResponses: [] }] }),
    /requiredResponses/
  );
  for (const response of [
    { ...partA.items[0].requiredResponses[0], labelSq: 1 },
    { ...partA.items[0].requiredResponses[0], options: [1] },
    { ...partA.items[0].requiredResponses[0], requiredWhen: [] },
  ]) {
    assert.throws(
      () =>
        normalizePacket({
          ...partA,
          items: [{ ...partA.items[0], requiredResponses: [response] }, partA.items[1]],
        }),
      /string|object/
    );
  }
});

test('rejects wrong types in decision and draft required fields', () => {
  assert.throws(
    () =>
      normalizeDecision({
        itemId: 1,
        decision: 'approve',
        concreteAnswer: 'fixture',
        reason: 'fixture',
        evidenceRef: 'docs/fixture.md',
        verifiedAt: '2026-07-09',
      }),
    /itemId.*string/
  );
  assert.throws(
    () =>
      normalizeDraft({
        assignmentId: 1,
        packetId: 'mob-03a-part-a',
        packetVersion: '1',
        reviewerFixtureId: reviewer.id,
        editorId: 'fixture-editor',
        schemaVersion: 1,
      }),
    /assignmentId.*string/
  );
});

test('preserves ordered IDs and validates every production fixture record', async () => {
  const repository = createFixtureRepository();
  const listed = await repository.listAssignments(reviewer.id);
  assert.equal(listed.ok, true);
  for (const assignment of listed.value) {
    assert.deepEqual(normalizeAssignment(assignment), assignment);
    const bundle = await repository.loadAssignmentBundle(assignment.id);
    assert.equal(bundle.ok, true);
    assert.deepEqual(
      bundle.value.packet.items.map(item => item.id),
      bundle.value.packet.itemIds
    );
    assert.equal(bundle.value.packet.items.length, 4);
  }
});
