import assert from 'node:assert/strict';
import test from 'node:test';
import { fakeDocument, walk } from './fake-dom.mjs';
import { setDocument } from '../public/src/components/dom.mjs';
import { loadValidationRoute } from '../public/src/app/validation-route.mjs';
import { bundle } from './review-session-fixtures.mjs';
import { makeStorage } from './state-fixtures.mjs';

setDocument(fakeDocument);

test('packet safety error navigates then preserves its exact focus target', async () => {
  globalThis.localStorage = makeStorage();
  let view;
  let target;
  let destination;
  await loadValidationRoute({
    route: { assignmentId: bundle.assignment.id },
    repository: { loadAssignmentBundle: async () => ({ ok: true, value: bundle }) },
    receiptStore: { save: async () => ({ ok: true }) },
    render: value => {
      view = value;
    },
    navigate: route => {
      destination = route;
    },
    focus: value => {
      target = value;
    },
  });
  walk(view)
    .find(entry => entry.tagName === 'BUTTON')
    .listeners.click();
  assert.equal(target, 'safe-evidence-confirmed');
  assert.deepEqual(destination, { name: 'workspace', assignmentId: 'assign_a', itemId: 'item_a' });
});
