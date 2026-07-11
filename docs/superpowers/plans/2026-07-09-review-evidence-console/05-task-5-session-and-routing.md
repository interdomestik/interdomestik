# Task 5: Review Session State And Hash Routing

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

## Chunk 2: Reviewer Workflow And Responsive UI

### Task 5: Add Review Session State And Hash Routing

**Files:**

- Create: `tools/review-evidence-console/public/src/router.mjs`
- Create: `tools/review-evidence-console/public/src/state/review-session.mjs`
- Test: `tools/review-evidence-console/tests/review-session.test.mjs`

- [ ] **Step 1: Write failing route and session tests (12 tests)**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRoute } from '../public/src/router.mjs';
import { createReviewSession } from '../public/src/state/review-session.mjs';
import { bundle } from './validation-fixtures.mjs';

test('parses inbox, packet, validation, and receipt routes', () => {
  assert.deepEqual(parseRoute('#/'), { name: 'inbox' });
  assert.deepEqual(parseRoute('#/review/assign_a/item_a'), {
    name: 'workspace',
    assignmentId: 'assign_a',
    itemId: 'item_a',
  });
  assert.deepEqual(parseRoute('#/review/assign_a/validate'), {
    name: 'validation',
    assignmentId: 'assign_a',
  });
  assert.deepEqual(parseRoute('#/receipt/rec_abc'), { name: 'receipt', receiptId: 'rec_abc' });
});

test('never treats system guidance as a human decision', () => {
  const session = createReviewSession(bundle);
  session.useGuidance('M03A-PRIVACY-OWNER');
  assert.equal(session.getDecision('M03A-PRIVACY-OWNER').decision, null);
  assert.notEqual(session.getDecision('M03A-PRIVACY-OWNER').concreteAnswer, '');
});
```

- [ ] **Step 2: Run the session test and verify RED**

Run:

```bash
node --test tools/review-evidence-console/tests/review-session.test.mjs
```

Expected: FAIL because router and session modules do not exist.

- [ ] **Step 3: Implement route parsing and session transitions**

Expose pure `parseRoute(hash)` and `formatRoute(route)` helpers. `createReviewSession(bundle, draft)` must expose `getSnapshot`, `selectItem`, `setDecision`, `setField`, `setResponse`, `useGuidance`, `validate`, and `createCorrection`. State changes return new frozen snapshots and call an injected `onChange` callback.

- [ ] **Step 4: Run the session test and verify GREEN**

Run:

```bash
node --test tools/review-evidence-console/tests/review-session.test.mjs
```

Expected: `12` tests pass with `0` failures.

- [ ] **Step 5: Commit routing and session state**

```bash
git add tools/review-evidence-console/public/src/router.mjs tools/review-evidence-console/public/src/state/review-session.mjs tools/review-evidence-console/tests/review-session.test.mjs
git commit -m "feat: add reviewer session flow"
```
