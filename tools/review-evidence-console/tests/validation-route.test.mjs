import assert from 'node:assert/strict';
import test from 'node:test';
import { fakeDocument, walk } from './fake-dom.mjs';
import { setDocument } from '../public/src/components/dom.mjs';
import { loadValidationRoute } from '../public/src/app/validation-route.mjs';
import { bundle, completeDecision } from './review-session-fixtures.mjs';
import { makeStorage } from './state-fixtures.mjs';
import { createDraftStore, composeDraftKey } from '../public/src/state/draft-store.mjs';
import { contextualDraftKey, draftWithUnknownField } from './contextual-draft-fixtures.mjs';

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
  globalThis.localStorage = makeStorage();
  const key = composeDraftKey({
    assignmentId: 'assign_a',
    reviewerFixtureId: 'reviewer_a',
    packetVersion: '1',
  });
  createDraftStore({ schemaVersion: 1 }).save(key, {
    schemaVersion: 1,
    assignmentId: 'assign_a',
    packetId: 'packet_a',
    reviewerFixtureId: 'reviewer_a',
    packetVersion: '1',
    activeItem: 'item_a',
    editorId: 'editor_a',
    updatedAt: '2026-07-10T12:00:00.000Z',
    safeEvidenceConfirmed: true,
    itemDecisions: { item_a: completeDecision, item_b: completeDecision },
  });
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
  await loadValidationRoute({ route: { assignmentId: 'assign_a' },
    repository: { loadAssignmentBundle: async () => ({ ok: true, value: bundle }) },
    receiptStore: { save: async () => assert.fail('invalid draft must not submit') },
    render: value => { view = value; }, navigate() {}, focus() {} });
  assert.match(walk(view).map(node => node.textContent).join(' '), /Plotëso/);
  assert.equal(storage.getItem(contextualDraftKey), JSON.stringify(draftWithUnknownField()));
});
