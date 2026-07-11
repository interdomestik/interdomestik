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
