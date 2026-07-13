import assert from 'node:assert/strict';
import test from 'node:test';

import { createFixtureRepository } from './static-fixture-repository.mjs';
import { normalizeAssignment } from '../public/src/models/normalize-fixture.mjs';
import { assignments, fakeLoader, reviewer } from './validation-fixtures.mjs';

test('authoritative Part A explicitly continues with Part B', async () => {
  const listed = await createFixtureRepository().listAssignments('reviewer_governance_mk');
  assert.equal(listed.ok, true);
  assert.equal(listed.value[0].continuesWithAssignmentId, 'assign_mob03a_part_b');
  assert.equal('continuesWithAssignmentId' in listed.value[1], false);
});

test('normalizes an optional continuation ID and rejects its wrong type', () => {
  assert.deepEqual(normalizeAssignment(assignments[0]), assignments[0]);
  assert.throws(
    () => normalizeAssignment({ ...assignments[0], continuesWithAssignmentId: 7 }),
    /continuesWithAssignmentId.*string/
  );
});

for (const [label, mutate] of [
  ['unknown', rows => [{ ...rows[0], continuesWithAssignmentId: 'assign_missing' }, rows[1]]],
  ['self', rows => [{ ...rows[0], continuesWithAssignmentId: rows[0].id }, rows[1]]],
  ['cross-reviewer', rows => [rows[0], { ...rows[1], reviewerFixtureId: 'reviewer_other' }]],
]) {
  test(`rejects ${label} continuation authority`, async () => {
    const loadJson = path =>
      path.endsWith('assignments.json') ? mutate(structuredClone(assignments)) : fakeLoader(path);
    const result = await createFixtureRepository({ loadJson }).listAssignments(reviewer.id);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'invalid_data');
  });
}
