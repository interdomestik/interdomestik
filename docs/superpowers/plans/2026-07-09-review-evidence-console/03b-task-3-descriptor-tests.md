# Task 3B: Descriptor Tests

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

- [ ] **Step 2: Write failing descriptor and conditional-field tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateItem } from '../public/src/validation/item.mjs';

const baseItem = { id: 'item', requiredResponses: [] };
const medicalItem = {
  id: 'medical',
  requiredResponses: [
    { key: 'medicalBoundary', type: 'option', required: true, options: ['allowed', 'excluded'] },
    {
      key: 'dpiaRef',
      type: 'evidenceRef',
      requiredWhen: { key: 'medicalBoundary', equals: 'allowed' },
    },
    {
      key: 'disabledScope',
      type: 'text',
      maxLength: 240,
      requiredWhen: { key: 'medicalBoundary', equals: 'excluded' },
    },
  ],
};
const completeDecision = overrides => ({
  decision: 'approve',
  concreteAnswer: 'Approved for the fixture boundary.',
  reason: 'The source authority supports this decision.',
  evidenceRef: 'docs/product/packet.md#L21',
  verifiedAt: '2026-07-09',
  riskCategory: 'privacy',
  severity: 'high',
  requestedChange: '',
  responses: {},
  ...overrides,
});

test('requires a DPIA reference only when medical data is allowed', () => {
  const allowed = validateItem(
    medicalItem,
    completeDecision({
      responses: { medicalBoundary: 'allowed', dpiaRef: '' },
    })
  );
  assert.deepEqual(
    allowed.errors.map(error => error.key),
    ['dpiaRef']
  );

  const excluded = validateItem(
    medicalItem,
    completeDecision({
      responses: { medicalBoundary: 'excluded', disabledScope: 'Medical data stays disabled.' },
    })
  );
  assert.equal(excluded.valid, true);
});

test('requires requested change for change and block decisions', () => {
  const result = validateItem(
    baseItem,
    completeDecision({ decision: 'block', requestedChange: '' })
  );
  assert.equal(
    result.errors.some(error => error.key === 'requestedChange'),
    true
  );
});

test('accepts a complete base decision', () => {
  assert.deepEqual(validateItem(baseItem, completeDecision({})), { valid: true, errors: [] });
});

test('rejects option values outside the descriptor', () => {
  const result = validateItem(
    medicalItem,
    completeDecision({ responses: { medicalBoundary: 'unknown' } })
  );
  assert.equal(
    result.errors.some(error => error.key === 'medicalBoundary'),
    true
  );
});

test('validates packet-level repo-safe evidence acknowledgement', () => {
  const result = validatePacket({ items: [baseItem] }, { item: completeDecision({}) }, false);
  assert.equal(
    result.errors.some(error => error.key === 'safeEvidenceConfirmed'),
    true
  );
});
```
