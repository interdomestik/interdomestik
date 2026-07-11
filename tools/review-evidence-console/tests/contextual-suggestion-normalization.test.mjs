import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeItem } from '../public/src/models/normalize-review.mjs';
import { partA } from './validation-fixtures.mjs';

const descriptor = (key, type, extra = {}) => ({
  key,
  labelSq: key,
  type,
  required: true,
  maxLength: 40,
  options: type === 'select' ? ['hide', 'show'] : [],
  optionLabelsSq: type === 'select' ? { hide: 'Hide', show: 'Show' } : {},
  ...extra,
});
const requiredResponses = [
  descriptor('control', 'select'),
  descriptor('retentionNote', 'textarea', {
    requiredWhen: { key: 'control', equals: 'show' },
  }),
  descriptor('alwaysNote', 'text'),
  descriptor('ownerDisplayName', 'text', {
    requiredWhen: { key: 'control', equals: 'show' },
  }),
  descriptor('conditionalRef', 'evidenceRef', {
    requiredWhen: { key: 'control', equals: 'show' },
  }),
];
const suggestedReview = {
  concreteAnswer: 'Keep the boundary.',
  reason: 'Authority supports it.',
  evidenceRef: 'docs/review.md',
  riskCategory: 'privacy',
  severity: 'high',
  requestedChange: 'Document the retained boundary.',
  responses: { control: 'hide' },
  useSessionDateFor: ['verifiedAt'],
};
const candidate = overrides => ({
  ...partA.items[0],
  requiredResponses,
  suggestedReview,
  ...overrides,
});
const rejectsConditional = conditionalResponses =>
  assert.throws(() =>
    normalizeItem(
      candidate({ suggestedReview: { ...suggestedReview, conditionalResponses } })
    )
  );

test('requires requestedChange and clones valid conditional text suggestions', () => {
  const missing = { ...suggestedReview };
  delete missing.requestedChange;
  assert.throws(() => normalizeItem(candidate({ suggestedReview: missing })));

  const source = { retentionNote: 'Retain only the revoked status.' };
  const normalized = normalizeItem(
    candidate({ suggestedReview: { ...suggestedReview, conditionalResponses: source } })
  );
  assert.deepEqual(normalized.suggestedReview.conditionalResponses, source);
  assert.notEqual(normalized.suggestedReview.conditionalResponses, source);
});

test('rejects malformed, unknown, sparse, unsafe, and over-limit conditional suggestions', () => {
  for (const value of [null, [], 'note', {}, new Array(1)]) rejectsConditional(value);
  rejectsConditional({ unknown: 'Safe note' });
  rejectsConditional({ retentionNote: 'reviewer@example.com' });
  rejectsConditional({ retentionNote: 'x'.repeat(41) });
});

test('allows only conditional textual non-identity and non-evidence descriptors', () => {
  rejectsConditional({ alwaysNote: 'Safe note' });
  rejectsConditional({ control: 'show' });
  rejectsConditional({ ownerDisplayName: 'Named owner' });
  rejectsConditional({ conditionalRef: 'docs/reference.md' });
});
