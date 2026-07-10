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
  buttons[1].listeners.click();
  assert.deepEqual(calls[0], ['item_a', 'decision-item_a-approve']);
  buttons[2].listeners.click();
  assert.deepEqual(calls[1], ['item_a', 'response-owner']);
});
