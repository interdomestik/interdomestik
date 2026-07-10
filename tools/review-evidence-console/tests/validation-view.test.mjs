import assert from 'node:assert/strict';
import test from 'node:test';
import { fakeDocument, walk } from './fake-dom.mjs';

globalThis.document = fakeDocument;
const { renderValidation } = await import('../public/src/views/validation.mjs');

test('groups every invalid field and routes to its exact control', () => {
  const calls = [];
  const node = renderValidation({
    validation: {
      valid: false,
      errors: [{ key: 'safeEvidenceConfirmed', message: 'Confirm safe evidence.' }],
      items: [
        {
          itemId: 'item_a',
          errors: [
            { key: 'decision', message: 'Choose a decision.' },
            { key: 'owner', message: 'Add owner.' },
          ],
        },
      ],
    },
    onFocusError: (...args) => calls.push(args),
  });
  const buttons = walk(node).filter(entry => entry.tagName === 'BUTTON');
  assert.equal(buttons.length, 3);
  buttons[0].listeners.click();
  assert.deepEqual(calls[0], [null, 'safe-evidence-confirmed']);
  buttons[1].listeners.click();
  assert.deepEqual(calls[1], ['item_a', 'decision-item_a-approve']);
  buttons[2].listeners.click();
  assert.deepEqual(calls[2], ['item_a', 'response-owner']);
});

test('uses native and ARIA busy-disabled submission semantics', () => {
  const node = renderValidation({
    validation: { valid: true, errorCount: 0, errors: [], items: [] },
    submitting: true,
  });
  const button = walk(node).find(entry => entry.tagName === 'BUTTON');
  assert.equal(button.attributes.disabled, 'disabled');
  assert.equal(button.attributes['aria-disabled'], 'true');
  assert.equal(button.attributes['aria-busy'], 'true');
  assert.equal(button.disabled, true);
});
