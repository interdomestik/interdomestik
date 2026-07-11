import assert from 'node:assert/strict';
import test from 'node:test';

import { createFixtureRepository } from '../public/src/data/fixture-repository.mjs';
import { normalizeAssignment } from '../public/src/models/normalize-fixture.mjs';
import { loadInboxRows } from '../public/src/views/inbox-data.mjs';
import { assignments, fakeLoader, reviewer } from './validation-fixtures.mjs';

const invalidLoader = (field, value) => async path =>
  path === '/data/assignments.json'
    ? [{ ...assignments[0], [field]: value }]
    : fakeLoader(path);

test('requires nonempty string assignment titleSq and purposeSq', () => {
  for (const field of ['titleSq', 'purposeSq']) {
    for (const value of [undefined, '', '   ', 7]) {
      assert.throws(
        () => normalizeAssignment({ ...assignments[0], [field]: value }),
        new RegExp(`${field} must be a non-empty string`)
      );
    }
  }
});

test('repository and inbox fail closed for invalid assignment display copy', async () => {
  for (const field of ['titleSq', 'purposeSq']) {
    for (const value of [undefined, '', '   ', 7]) {
      const repository = createFixtureRepository({ loadJson: invalidLoader(field, value) });
      assert.equal((await repository.listAssignments(reviewer.id)).code, 'invalid_data');
      const inbox = await loadInboxRows(repository, reviewer.id);
      assert.equal(inbox.code, 'invalid_data');
      assert.equal(inbox.value, undefined);
    }
  }
});
