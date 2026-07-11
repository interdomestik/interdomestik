# Task 2B: Fixture Repository Implementation

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

```js
test('normalizes reviewer, assignment, and packet records', () => {
  assert.deepEqual(normalizeReviewer(reviewer), reviewer);
  assert.deepEqual(normalizeAssignment(assignments[0]), assignments[0]);
  assert.deepEqual(normalizePacket(partA).itemIds, partA.itemIds);
});

test('preserves exact ordered item IDs and descriptor keys', () => {
  for (const packet of [partA, partB]) {
    assert.deepEqual(
      packet.items.map(entry => entry.id),
      packet.itemIds
    );
    assert.ok(
      packet.items.every(
        entry =>
          entry.prompt &&
          entry.need &&
          entry.repoImpact &&
          entry.guidance &&
          entry.baseFields.length
      )
    );
  }
});

test('loads one reviewer profile', async () => {
  const result = await createFixtureRepository({ loadJson: fakeLoader }).loadReviewerProfile(
    reviewer.id
  );
  assert.deepEqual(result, { ok: true, value: reviewer });
});

test('loads each four-item packet independently', async () => {
  const repository = createFixtureRepository({ loadJson: fakeLoader });
  assert.equal((await repository.loadPacket(partA.id)).value.items.length, 4);
  assert.equal((await repository.loadPacket(partB.id)).value.items.length, 4);
});

test('returns one validated assignment bundle', async () => {
  const result = await createFixtureRepository({ loadJson: fakeLoader }).loadAssignmentBundle(
    assignments[0].id
  );
  assert.equal(result.ok, true);
  assert.equal(result.value.assignment.id, assignments[0].id);
  assert.equal(result.value.reviewer.id, reviewer.id);
  assert.equal(result.value.packet.id, partA.id);
});

test('returns stable errors for missing and malformed fixtures', async () => {
  const missing = await createFixtureRepository({ loadJson: fakeLoader }).loadPacket('missing');
  assert.deepEqual(missing, {
    ok: false,
    code: 'not_found',
    message: 'Packet fixture was not found.',
  });
  assert.throws(() => normalizePacket({ ...partA, items: [{ id: 'bad' }] }), /requiredResponses/);
});
```

- [ ] **Step 2: Run repository tests and verify RED**

Run:

```bash
node --test tools/review-evidence-console/tests/fixture-repository.test.mjs
```

Expected: FAIL because the repository module does not exist.

- [ ] **Step 3: Create the fixtures**

Create `assign_mob03a_part_a` in progress and `assign_mob03a_part_b` not started for `reviewer_privacy_mk`. Part A references `mob-03a-part-a`; Part B references `mob-03a-part-b`. Mark every assignment `fixture: true` and every profile `repoSafe: true`. Use roles, not account IDs.

Define four structured items per packet file. Each `requiredResponses` descriptor must include `key`, `labelSq`, `type`, `required`, `maxLength`, `options`, and `requiredWhen` when conditional. Keep medical/injury excluded in fixture content. Keep each packet JSON below 200 lines.

- [ ] **Step 4: Implement normalization and repository results**

`normalize-fixture.mjs` exposes reviewer, assignment, and packet normalizers. `normalize-review.mjs` exposes item, decision, and draft normalizers. `fixture-repository.mjs` must expose:

```js
export function createFixtureRepository({ loadJson = defaultJsonLoader } = {}) {
  return {
    listAssignments,
    loadPacket,
    loadReviewerProfile,
    loadAssignmentBundle,
  };
}
```

Every method returns `{ ok: true, value }` or `{ ok: false, code, message }`. Cross-check assignment packet ID, reviewer fixture ID, and reviewer role before returning a bundle.

- [ ] **Step 5: Run repository tests and verify GREEN**

Run:

```bash
node --test tools/review-evidence-console/tests/fixture-repository.test.mjs
```

Expected: `9` tests pass with `0` failures.

- [ ] **Step 6: Commit the fixture repository**

```bash
git add tools/review-evidence-console/public/data tools/review-evidence-console/public/src/models tools/review-evidence-console/public/src/data tools/review-evidence-console/tests/fixture-repository.test.mjs
git commit -m "feat: add reviewer packet fixtures"
```
