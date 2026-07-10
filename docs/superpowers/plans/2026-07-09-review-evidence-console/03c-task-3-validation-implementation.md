# Task 3C: Validation Implementation

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

In `packet-validation.test.mjs`, use the same concrete item and decision shapes:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePacket } from '../public/src/validation/packet.mjs';

test('returns item validation in packet order', () => {
  const result = validatePacket(
    {
      items: [
        { id: 'first', requiredResponses: [] },
        { id: 'second', requiredResponses: [] },
      ],
    },
    {}
  );
  assert.deepEqual(
    result.items.map(entry => entry.itemId),
    ['first', 'second']
  );
});

test('groups the exact missing-field count', () => {
  const result = validatePacket({ items: [{ id: 'only', requiredResponses: [] }] }, { only: {} });
  assert.equal(result.valid, false);
  assert.equal(result.errorCount, 7);
});

test('rejects invalid dates and guarded nested fields', () => {
  const invalidDate = validateItem(baseItem, completeDecision({ verifiedAt: 'not-a-date' }));
  const unsafeReason = validateItem(
    baseItem,
    completeDecision({ reason: 'contact me at reviewer@example.com' })
  );
  assert.equal(
    invalidDate.errors.some(error => error.key === 'verifiedAt'),
    true
  );
  assert.equal(
    unsafeReason.errors.some(error => error.key === 'reason'),
    true
  );
});
```

- [ ] **Step 3: Run both validation files and verify RED**

Run:

```bash
node --test tools/review-evidence-console/tests/input-guards.test.mjs tools/review-evidence-console/tests/item-validation.test.mjs tools/review-evidence-console/tests/packet-validation.test.mjs
```

Expected: FAIL because validation modules do not exist.

- [ ] **Step 4: Implement exact guard patterns**

Implement the exact evidence-reference, email, URL scheme, credential, numeric sequence, control-character, and length rules from the spec. Return stable field errors:

```js
{ ok: false, code: 'sensitive_input', message: 'Use repo-safe operational text only.' }
```

Do not sanitize and silently accept forbidden input.

- [ ] **Step 5: Implement descriptor-driven validation**

`item-validation.test.mjs` imports only `validateItem` and shared fixtures from `tests/validation-fixtures.mjs`. `packet-validation.test.mjs` imports both validators and passes `true` for ordinary packet cases and `false` only for the acknowledgement failure. `item.mjs` exports `validateItem(item, decision)` for seven item-level fields, `requiredResponses`, `requiredWhen`, option membership, dates, free-text guards, and evidence references. `packet.mjs` exports `validatePacket(packet, decisions, safeEvidenceConfirmed)` and owns the single packet-level safety acknowledgement. Neither file may exceed 150 lines.

- [ ] **Step 6: Run validation tests and verify GREEN**

Run:

```bash
node --test tools/review-evidence-console/tests/input-guards.test.mjs tools/review-evidence-console/tests/item-validation.test.mjs tools/review-evidence-console/tests/packet-validation.test.mjs
```

Expected: `20` tests pass with `0` failures.

- [ ] **Step 7: Commit validation**

```bash
git add tools/review-evidence-console/public/src/validation tools/review-evidence-console/tests/input-guards.test.mjs tools/review-evidence-console/tests/item-validation.test.mjs tools/review-evidence-console/tests/packet-validation.test.mjs
git commit -m "feat: validate reviewer evidence"
```
