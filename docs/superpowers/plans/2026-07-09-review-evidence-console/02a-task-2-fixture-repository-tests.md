# Task 2A: Fixture Repository Tests

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

### Task 2: Add Repo-Safe Fixtures And Repository Validation

**Files:**

- Create: `tools/review-evidence-console/public/data/reviewers.json`
- Create: `tools/review-evidence-console/public/data/assignments.json`
- Create: `tools/review-evidence-console/public/data/packets/mob-03a-part-a.json`
- Create: `tools/review-evidence-console/public/data/packets/mob-03a-part-b.json`
- Create: `tools/review-evidence-console/public/src/models/normalize-fixture.mjs`
- Create: `tools/review-evidence-console/public/src/models/normalize-review.mjs`
- Create: `tools/review-evidence-console/public/src/data/fixture-repository.mjs`
- Test: `tools/review-evidence-console/tests/fixture-repository.test.mjs`
- Test: `tools/review-evidence-console/tests/default-json-loader.test.mjs`
- Test: `tools/review-evidence-console/tests/validation-fixtures.mjs`

- [ ] **Step 1: Write eight failing repository, normalization, and loader tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createFixtureRepository } from '../public/src/data/fixture-repository.mjs';
import {
  normalizeAssignment,
  normalizePacket,
  normalizeReviewer,
} from '../public/src/models/normalize-fixture.mjs';

const reviewer = {
  id: 'reviewer_privacy_mk',
  displayName: 'Privacy reviewer',
  role: 'privacy',
  repoSafe: true,
};
const assignments = [
  {
    id: 'assign_mob03a_part_a',
    packetId: 'mob-03a-part-a',
    reviewerFixtureId: reviewer.id,
    reviewerRole: 'privacy',
    status: 'in_progress',
    dueDate: '2026-07-15',
    risk: 'high',
    fixture: true,
  },
  {
    id: 'assign_mob03a_part_b',
    packetId: 'mob-03a-part-b',
    reviewerFixtureId: reviewer.id,
    reviewerRole: 'privacy',
    status: 'not_started',
    dueDate: '2026-07-16',
    risk: 'medium',
    fixture: true,
  },
];
const item = {
  id: 'M03A-PRIVACY-OWNER',
  prompt: 'Who owns the decision?',
  need: 'Named ownership is required.',
  repoImpact: 'Keeps review accountability local.',
  guidance: 'Use the fixture role only.',
  baseFields: [
    'decision',
    'concreteAnswer',
    'reason',
    'evidenceRef',
    'verifiedAt',
    'riskCategory',
    'severity',
    'requestedChange',
  ],
  allowedRiskCategories: ['privacy', 'legal'],
  requiredResponses: [
    { key: 'ownerRole', type: 'text', required: true, maxLength: 80, options: [] },
  ],
};
const partA = {
  id: 'mob-03a-part-a',
  version: '1',
  reviewerRole: 'privacy',
  title: 'Mobile authority evidence — privacy',
  scope: 'Fixture-only mobile privacy authority review.',
  stopConditions: ['Missing authority reference', 'Sensitive evidence supplied'],
  itemIds: [
    'M03A-PRIVACY-OWNER',
    'M03A-MEDICAL-BOUNDARY',
    'M03A-CONSENT-FIELDS',
    'M03A-ACCESS-ROLES',
  ],
  items: [
    item,
    { ...item, id: 'M03A-MEDICAL-BOUNDARY' },
    { ...item, id: 'M03A-CONSENT-FIELDS' },
    { ...item, id: 'M03A-ACCESS-ROLES' },
  ],
};
const partB = {
  ...partA,
  id: 'mob-03a-part-b',
  items: partA.items.map((entry, index) => ({ ...entry, id: `M03A-PART-B-${index + 1}` })),
};
partB.itemIds = partB.items.map(entry => entry.id);
const fixtureMap = new Map([
  ['/data/reviewers.json', [reviewer]],
  ['/data/assignments.json', assignments],
  ['/data/packets/mob-03a-part-a.json', partA],
  ['/data/packets/mob-03a-part-b.json', partB],
]);
const fakeLoader = async path => structuredClone(fixtureMap.get(path));
const mismatchedLoader = async path =>
  path.endsWith('mob-03a-part-a.json') ? { ...partA, reviewerRole: 'legal' } : fakeLoader(path);

test('returns only assignments for the selected fixture reviewer', async () => {
  const repository = createFixtureRepository({ loadJson: fakeLoader });
  const result = await repository.listAssignments('reviewer_privacy_mk');
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.value.map(row => row.id),
    ['assign_mob03a_part_a', 'assign_mob03a_part_b']
  );
});

test('rejects a packet role that disagrees with the assignment reviewer', async () => {
  const repository = createFixtureRepository({ loadJson: mismatchedLoader });
  const result = await repository.loadAssignmentBundle('assign_mob03a_part_a');
  assert.deepEqual(result, {
    ok: false,
    code: 'invalid_data',
    message: 'Assignment, reviewer, and packet roles do not match.',
  });
});
```
