import assert from 'node:assert/strict';
import test from 'node:test';
import { fakeDocument, walk } from './fake-dom.mjs';
import { setDocument } from '../public/src/components/dom.mjs';
import { loadValidationRoute } from '../public/src/app/validation-route.mjs';
import { bundle } from './review-session-fixtures.mjs';
import { makeStorage } from './state-fixtures.mjs';
import { contextualDraftKey, draftWithUnknownField } from './contextual-draft-fixtures.mjs';
import { completedValidationDraft } from './completed-validation-draft.mjs';

setDocument(fakeDocument);

test('packet safety error navigates then preserves its exact focus target', async () => {
  globalThis.localStorage = makeStorage();
  let view;
  let target;
  let destination;
  let focusId;
  await loadValidationRoute({
    route: { assignmentId: bundle.assignment.id },
    repository: { loadAssignmentBundle: async () => ({ ok: true, value: bundle }) },
    receiptStore: { save: async () => ({ ok: true }) },
    render: (value, role, focus) => {
      view = value;
      focusId = focus;
    },
    navigate: route => {
      destination = route;
    },
    focus: value => {
      target = value;
    },
  });
  assert.equal(focusId, 'validation-heading');
  walk(view)
    .find(entry => entry.tagName === 'BUTTON')
    .listeners.click();
  assert.equal(target, 'safe-evidence-confirmed');
  assert.deepEqual(destination, { name: 'workspace', assignmentId: 'assign_a', itemId: 'item_a' });
});

test('stale deferred submission neither redraws nor navigates', async () => {
  globalThis.localStorage = completedValidationDraft();
  let current = true;
  const renders = [];
  const navigations = [];
  await loadValidationRoute({
    route: { assignmentId: 'assign_a' },
    repository: { loadAssignmentBundle: async () => ({ ok: true, value: bundle }) },
    receiptStore: { save: async receipt => ({ ok: true, value: receipt }) },
    render: value => renders.push(value),
    navigate: value => navigations.push(value),
    current: () => current,
    focus: () => {},
  });
  walk(renders.at(-1))
    .find(entry => entry.tagName === 'BUTTON')
    .listeners.click();
  const count = renders.length;
  current = false;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(renders.length, count);
  assert.deepEqual(navigations, []);
});

test('derives packet context before loading validation draft state', async () => {
  const storage = makeStorage();
  storage.setItem(contextualDraftKey, JSON.stringify(draftWithUnknownField()));
  globalThis.localStorage = storage;
  let view;
  await loadValidationRoute({
    route: { assignmentId: 'assign_a' },
    repository: { loadAssignmentBundle: async () => ({ ok: true, value: bundle }) },
    receiptStore: { save: async () => assert.fail('invalid draft must not submit') },
    render: value => {
      view = value;
    },
    navigate() {},
    focus() {},
  });
  assert.match(
    walk(view)
      .map(node => node.textContent)
      .join(' '),
    /Plotëso/
  );
  assert.equal(storage.getItem(contextualDraftKey), JSON.stringify(draftWithUnknownField()));
});

test('submission uses the route directory writer and opens inbox only after its save', async () => {
  globalThis.localStorage = completedValidationDraft();
  const events = [];
  let view;
  await loadValidationRoute({
    route: { assignmentId: 'assign_a' },
    repository: { loadAssignmentBundle: async () => ({ ok: true, value: bundle }) },
    receiptStore: {
      save: async receipt => (events.push(['store', receipt]), { ok: true, value: receipt }),
    },
    directoryWriter: {
      requestDirectory: () => (events.push(['picker']), Promise.resolve({ ok: true, value: {} })),
      save: async receipt => (events.push(['write', receipt]), { ok: true }),
    },
    render: value => {
      view = value;
    },
    navigate: value => events.push(['navigate', value]),
    focus() {},
  });
  walk(view)
    .find(entry => entry.tagName === 'BUTTON')
    .listeners.click();
  assert.deepEqual(events, [['picker']]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(
    events.map(event => event[0]),
    ['picker', 'store', 'write', 'navigate']
  );
  assert.deepEqual(events.at(-1)[1], { name: 'inbox' });
});
