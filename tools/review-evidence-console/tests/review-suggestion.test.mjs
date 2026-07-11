import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeItem } from '../public/src/models/normalize-review.mjs';
import { partA } from './validation-fixtures.mjs';

const source = partA.items[0];
const descriptors = [
  {
    key: 'control', labelSq: 'Control', type: 'select', required: true, maxLength: 8,
    options: ['yes', 'no'], optionLabelsSq: { yes: 'Yes', no: 'No' },
  },
  {
    key: 'detail', labelSq: 'Detail', type: 'text', required: true, maxLength: 20,
    options: [], optionLabelsSq: {}, requiredWhen: { key: 'control', equals: 'yes' },
  },
  {
    key: 'single', labelSq: 'Single', type: 'radio', required: true, maxLength: 8,
    options: ['one', 'two'], optionLabelsSq: { one: 'One', two: 'Two' },
  },
  {
    key: 'many', labelSq: 'Many', type: 'multi_select', required: true, maxLength: 20,
    options: ['a', 'b'], optionLabelsSq: { a: 'A', b: 'B' },
  },
  {
    key: 'note', labelSq: 'Note', type: 'textarea', required: true, maxLength: 20,
    options: [], optionLabelsSq: {},
  },
  {
    key: 'ref', labelSq: 'Ref', type: 'evidenceRef', required: true, maxLength: 20,
    options: [], optionLabelsSq: {},
  },
  {
    key: 'reviewedAt', labelSq: 'Date', type: 'date', required: true, maxLength: 10,
    options: [], optionLabelsSq: {},
  },
];
const suggestion = {
  concreteAnswer: 'Keep the boundary.',
  reason: 'Authority supports it.',
  evidenceRef: 'docs/review.md',
  riskCategory: 'privacy',
  severity: 'high',
  requestedChange: 'Keep this boundary in place.',
  responses: { control: 'no', single: 'one', many: ['a', 'b'], note: 'Safe note', ref: 'docs/ref.md' },
  useSessionDateFor: ['verifiedAt', 'reviewedAt'],
};
const item = { ...source, requiredResponses: descriptors, suggestedReview: suggestion };
const withSuggestion = next => ({ ...item, suggestedReview: next });
const replace = (key, value) => withSuggestion({ ...suggestion, [key]: value });
const rejects = candidate => assert.throws(() => normalizeItem(candidate));

test('requires a strict suggestion object and all common fields', () => {
  for (const value of [undefined, null, [], 'suggestion']) rejects(withSuggestion(value));
  for (const key of Object.keys(suggestion)) {
    const candidate = { ...suggestion };
    delete candidate[key];
    rejects(withSuggestion(candidate));
  }
  for (const key of ['concreteAnswer', 'reason', 'evidenceRef', 'riskCategory', 'severity']) {
    rejects(replace(key, ' \n'));
  }
});

test('rejects forbidden and unknown suggestion keys', () => {
  for (const key of ['decision', 'safeEvidenceConfirmed', 'verifiedAt', 'unknown']) {
    rejects(withSuggestion({ ...suggestion, [key]: 'forbidden' }));
  }
});

test('requires an exact response object with canonical scalar and array values', () => {
  for (const value of [null, [], 'responses']) rejects(replace('responses', value));
  const invalid = [
    { ...suggestion.responses, unknown: 'value' },
    { ...suggestion.responses, single: ['one'] },
    { ...suggestion.responses, many: 'a' },
    { ...suggestion.responses, many: ['a', 'a'] },
    { ...suggestion.responses, single: 'unknown' },
    { ...suggestion.responses, many: ['unknown'] },
    { ...suggestion.responses, note: '  ' },
    { ...suggestion.responses, note: 'reviewer@example.com' },
    { ...suggestion.responses, note: 'x'.repeat(21) },
    { ...suggestion.responses, ref: 'https://unsafe.example' },
    { ...suggestion.responses, detail: 'inapplicable' },
  ];
  for (const responses of invalid) rejects(replace('responses', responses));
});

test('rejects sparse response and session-date arrays', () => {
  rejects(replace('responses', { ...suggestion.responses, many: new Array(1) }));
  rejects(replace('useSessionDateFor', new Array(1)));
});

test('keeps date descriptors session-owned with unique date keys', () => {
  rejects(replace('responses', { ...suggestion.responses, reviewedAt: '2026-07-10' }));
  rejects(replace('useSessionDateFor', ['reviewedAt', 'reviewedAt']));
  rejects(replace('useSessionDateFor', ['note']));
  rejects(replace('useSessionDateFor', 'reviewedAt'));
});

test('guards common values and exact risk and severity contracts', () => {
  for (const key of ['concreteAnswer', 'reason', 'requestedChange']) {
    rejects(replace(key, 'reviewer@example.com'));
    rejects(replace(key, 'x'.repeat(2001)));
  }
  rejects(replace('evidenceRef', 'https://unsafe.example'));
  rejects(replace('evidenceRef', `docs/${'x'.repeat(236)}`));
  rejects(replace('riskCategory', 'security'));
  rejects(replace('severity', 'critical'));
});

test('normalizes the exact valid suggestion without defaults', () => {
  assert.deepEqual(normalizeItem(item).suggestedReview, suggestion);
});
