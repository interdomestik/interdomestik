# Task 4A: Draft Persistence Tests

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

### Task 4: Implement Draft And Receipt Persistence

**Files:**

- Create: `tools/review-evidence-console/public/src/state/canonical-json.mjs`
- Create: `tools/review-evidence-console/public/src/state/draft-store.mjs`
- Create: `tools/review-evidence-console/public/src/state/receipt-builder.mjs`
- Create: `tools/review-evidence-console/public/src/state/receipt-store.mjs`
- Test: `tools/review-evidence-console/tests/draft-store.test.mjs`
- Test: `tools/review-evidence-console/tests/receipt-builder.test.mjs`
- Test: `tools/review-evidence-console/tests/receipt-store.test.mjs`

- [ ] **Step 1: Write failing draft key and conflict tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { composeDraftKey, createDraftStore } from '../public/src/state/draft-store.mjs';

const makeStorage = () => {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
};
const storage = makeStorage();
const store = createDraftStore({ storage, schemaVersion: 1 });
const key = 'review-console:v1:draft:assign_a:reviewer_a:2';
const draft = {
  schemaVersion: 1,
  assignmentId: 'assign_a',
  packetId: 'mob-03a-part-a',
  reviewerFixtureId: 'reviewer_a',
  packetVersion: '2',
  itemDecisions: { item_a: { decision: 'approve' } },
  activeItem: 'item_a',
  updatedAt: '2026-07-09T12:00:00.000Z',
  editorId: 'tab_a',
};

test('separates drafts by assignment, reviewer, and packet version', () => {
  assert.equal(
    composeDraftKey({
      assignmentId: 'assign_a',
      reviewerFixtureId: 'reviewer_a',
      packetVersion: '2',
    }),
    'review-console:v1:draft:assign_a:reviewer_a:2'
  );
  assert.throws(() =>
    composeDraftKey({ assignmentId: '../bad', reviewerFixtureId: 'r', packetVersion: '1' })
  );
});

test('returns conflict when a newer tab already saved', () => {
  storage.setItem(
    key,
    JSON.stringify({ updatedAt: '2026-07-09T12:01:00.000Z', editorId: 'other' })
  );
  const result = store.save(key, draft, '2026-07-09T12:00:00.000Z');
  assert.equal(result.code, 'conflict');
});

test('saves and loads a compatible draft', () => {
  assert.equal(store.save(key, draft, null).ok, true);
  assert.deepEqual(store.load(key), { ok: true, value: draft });
});

test('rejects a structurally incomplete draft', () => {
  assert.equal(store.save(key, { ...draft, packetId: undefined }, null).code, 'invalid_data');
});

test('removes only the requested draft', () => {
  storage.setItem('other', '{}');
  assert.equal(store.remove(key).ok, true);
  assert.equal(storage.getItem('other'), '{}');
});

test('exports incompatible data without deleting it', () => {
  storage.setItem(key, JSON.stringify({ ...draft, schemaVersion: 2 }));
  assert.equal(store.load(key).code, 'schema_mismatch');
  assert.match(store.exportRecovery(key).value, /"schemaVersion":2/);
  assert.notEqual(storage.getItem(key), null);
});

test('preserves corrupt JSON for recovery or deletion', () => {
  storage.setItem(key, '{bad');
  assert.equal(store.load(key).code, 'invalid_data');
  assert.equal(store.exportRecovery(key).value, '{bad');
});

test('maps quota failures to a stable error', () => {
  const quotaStorage = makeStorage();
  quotaStorage.setItem = () => {
    throw new DOMException('full', 'QuotaExceededError');
  };
  assert.equal(
    createDraftStore({ storage: quotaStorage, schemaVersion: 1 }).save(key, draft, null).code,
    'quota'
  );
});
```
