import assert from 'node:assert/strict';
import test from 'node:test';
import { validateItem } from '../public/src/validation/item.mjs';
import { baseItem, completeDecision, medicalItem } from './validation-fixtures.mjs';

test('requires a DPIA reference only when medical data is allowed', () => {
  const allowed = validateItem(
    medicalItem,
    completeDecision({ responses: { medicalBoundary: 'allowed', dpiaRef: '' } })
  );
  assert.deepEqual(allowed.errors.map(error => error.key), ['dpiaRef']);

  const excluded = validateItem(
    medicalItem,
    completeDecision({
      responses: { medicalBoundary: 'excluded', disabledScope: 'Medical data stays disabled.' },
    })
  );
  assert.equal(excluded.valid, true);
});

test('requires requested change for change and block decisions', () => {
  for (const decision of ['change', 'block']) {
    const result = validateItem(baseItem, completeDecision({ decision, requestedChange: '' }));
    assert.equal(result.errors.some(error => error.key === 'requestedChange'), true);
  }
});

test('accepts a complete base decision', () => {
  assert.deepEqual(validateItem(baseItem, completeDecision()), { valid: true, errors: [] });
});

test('rejects option values outside the descriptor', () => {
  const result = validateItem(
    medicalItem,
    completeDecision({ responses: { medicalBoundary: 'unknown' } })
  );
  assert.equal(result.errors.some(error => error.key === 'medicalBoundary'), true);
});

test('rejects invalid dates and guarded nested fields', () => {
  const invalidDate = validateItem(baseItem, completeDecision({ verifiedAt: 'not-a-date' }));
  const unsafeReason = validateItem(
    baseItem,
    completeDecision({ reason: 'contact me at reviewer@example.com' })
  );
  assert.equal(invalidDate.errors.some(error => error.key === 'verifiedAt'), true);
  assert.equal(unsafeReason.errors.some(error => error.key === 'reason'), true);
});

test('enforces descriptor-specific evidence reference length', () => {
  const item = {
    ...baseItem,
    requiredResponses: [
      { key: 'shortRef', type: 'evidenceRef', required: true, maxLength: 20, options: [] },
    ],
  };
  const exact = completeDecision({ responses: { shortRef: 'docs/a12345678901.md' } });
  const over = completeDecision({ responses: { shortRef: 'docs/a123456789012.md' } });
  assert.equal(validateItem(item, exact).valid, true);
  assert.equal(
    validateItem(item, over).errors.some(error => error.key === 'shortRef'),
    true
  );
});

test('rejects unsupported critical severity', () => {
  const result = validateItem(baseItem, completeDecision({ severity: 'critical' }));
  assert.equal(result.errors.some(error => error.key === 'severity'), true);
});

test('treats whitespace-only required base text as empty', () => {
  for (const key of ['concreteAnswer', 'reason']) {
    const result = validateItem(baseItem, completeDecision({ [key]: '   \n' }));
    assert.equal(result.errors.find(error => error.key === key)?.code, 'required');
  }
  const change = validateItem(
    baseItem,
    completeDecision({ decision: 'change', requestedChange: '  ' })
  );
  assert.equal(change.errors.find(error => error.key === 'requestedChange')?.code, 'required');
});

test('treats whitespace-only required descriptor text as empty', () => {
  const item = {
    ...baseItem,
    requiredResponses: [
      { key: 'note', type: 'text', required: true, maxLength: 80, options: [] },
      {
        key: 'detail',
        type: 'textarea',
        requiredWhen: { key: 'control', equals: 'yes' },
        maxLength: 80,
        options: [],
      },
      { key: 'control', type: 'radio', required: true, options: ['yes', 'no'] },
    ],
  };
  const result = validateItem(
    item,
    completeDecision({ responses: { note: ' ', detail: '\n ', control: 'yes' } })
  );
  assert.deepEqual(
    result.errors.filter(error => ['note', 'detail'].includes(error.key)).map(error => error.code),
    ['required', 'required']
  );
});

test('enforces canonical descriptor response cardinality', () => {
  for (const type of ['radio', 'select']) {
    const item = {
      ...baseItem,
      requiredResponses: [{ key: 'choice', type, required: true, options: ['yes'] }],
    };
    const result = validateItem(item, completeDecision({ responses: { choice: ['yes'] } }));
    assert.equal(result.errors.find(error => error.key === 'choice')?.code, 'invalid_type');
  }
  for (const type of ['multi_select', 'checkbox_group']) {
    const item = {
      ...baseItem,
      requiredResponses: [{ key: 'choices', type, required: true, options: ['yes'] }],
    };
    const wrongType = validateItem(item, completeDecision({ responses: { choices: 'yes' } }));
    const wrongOption = validateItem(item, completeDecision({ responses: { choices: ['no'] } }));
    assert.equal(wrongType.errors.find(error => error.key === 'choices')?.code, 'invalid_type');
    assert.equal(wrongOption.errors.find(error => error.key === 'choices')?.code, 'invalid_option');
  }
});
