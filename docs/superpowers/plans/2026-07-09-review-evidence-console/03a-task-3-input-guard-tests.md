# Task 3A: Input Guard Tests

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

### Task 3: Implement Input Guards And Descriptor Validation

**Files:**

- Create: `tools/review-evidence-console/public/src/validation/input-guards.mjs`
- Create: `tools/review-evidence-console/public/src/validation/item.mjs`
- Create: `tools/review-evidence-console/public/src/validation/packet.mjs`
- Test: `tools/review-evidence-console/tests/input-guards.test.mjs`
- Test: `tools/review-evidence-console/tests/item-validation.test.mjs`
- Test: `tools/review-evidence-console/tests/packet-validation.test.mjs`

- [ ] **Step 1: Write failing input-guard tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEvidenceRef, validateSafeText } from '../public/src/validation/input-guards.mjs';

test('accepts allowed repo references', () => {
  assert.equal(validateEvidenceRef('docs/product/packet.md#L21').ok, true);
  assert.equal(validateEvidenceRef('output/review/packet.json').ok, true);
});

for (const value of [
  'https://private.example/evidence',
  'docs/../secret',
  'docs//bad.md',
  'docs/file.md?raw=1',
]) {
  test(`rejects invalid reference: ${value}`, () => {
    assert.equal(validateEvidenceRef(value).code, 'invalid_reference');
  });
}

for (const value of [
  'reviewer@example.com',
  'https://private.example',
  'Bearer abc123',
  '4111111111111111',
]) {
  test(`rejects sensitive text: ${value}`, () => {
    assert.equal(validateSafeText(value).code, 'sensitive_input');
  });
}

test('rejects control characters', () =>
  assert.equal(validateSafeText('bad\u0000value').code, 'sensitive_input'));
test('rejects values over the supplied limit', () =>
  assert.equal(validateSafeText('abcd', { maxLength: 3 }).code, 'too_long'));
test('accepts short repo-safe prose', () =>
  assert.equal(validateSafeText('Medical data stays disabled.').ok, true));
```
