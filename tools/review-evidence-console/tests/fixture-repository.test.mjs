import assert from 'node:assert/strict';
import test from 'node:test';

import { createFixtureRepository } from '../public/src/data/fixture-repository.mjs';
import {
  normalizeAssignment,
  normalizePacket,
  normalizeReviewer,
} from '../public/src/models/normalize-fixture.mjs';
import { assignments, fakeLoader, partA, reviewer } from './validation-fixtures.mjs';

test('filters assignments by reviewer fixture', async () => {
  const result = await createFixtureRepository({ loadJson: fakeLoader }).listAssignments(
    reviewer.id
  );
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
    message: 'Packet fixture was not found.',
  });
  const mismatch = async path =>
    path.endsWith('mob-03a-part-a.json') ? { ...partA, reviewerRole: 'legal' } : fakeLoader(path);
  assert.deepEqual(
    await createFixtureRepository({ loadJson: mismatch }).loadAssignmentBundle(assignments[0].id),
    {
      ok: false,
      code: 'invalid_data',
      message: 'Assignment, reviewer, and packet roles do not match.',
    }
  );
});

test('converts a packet loader failure into invalid_data', async () => {
  const brokenLoader = async () => {
    throw new Error('unavailable fixture');
  };
  assert.deepEqual(await createFixtureRepository({ loadJson: brokenLoader }).loadPacket(partA.id), {
    ok: false,
    code: 'invalid_data',
    message: 'Packet fixture is invalid.',
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
