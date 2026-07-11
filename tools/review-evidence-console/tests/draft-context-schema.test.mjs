import assert from 'node:assert/strict';
import test from 'node:test';
import { composeDraftKey, createDraftStore } from '../public/src/state/draft-store.mjs';
import { createDraftContextSchema } from '../public/src/state/draft-context-schema.mjs';
import { makeStorage } from './state-fixtures.mjs';
import { suggestionBundle, storedDraft } from './suggestion-state-fixtures.mjs';

const bundle = suggestionBundle();
const schema = createDraftContextSchema(bundle.packet);
const key = composeDraftKey({
  assignmentId: bundle.assignment.id,
  reviewerFixtureId: bundle.reviewer.id,
  packetVersion: bundle.packet.version,
});
const state = status =>
  Object.fromEntries(bundle.packet.itemIds.map(id => [id, { requestedChange: { status } }]));

test('accepts valid v1 migration input and validated v2 contextual sidecars', () => {
  const store = createDraftStore({
    storage: makeStorage(),
    schemaVersion: 1,
    contextSchema: schema,
  });
  assert.equal(store.save(key, storedDraft(), null).ok, true);
  const v2 = storedDraft({ suggestionVersion: 2, contextualNoteState: state('dismissed') });
  assert.equal(store.save(key, v2, storedDraft().updatedAt).ok, true);
});

test('rejects unknown contextual items, fields, statuses, and unsupported versions', () => {
  const store = createDraftStore({
    storage: makeStorage(),
    schemaVersion: 1,
    contextSchema: schema,
  });
  const base = storedDraft({ suggestionVersion: 2, contextualNoteState: state('unseen') });
  for (const candidate of [
    { ...base, suggestionVersion: 3 },
    { ...base, contextualNoteState: { ...base.contextualNoteState, unknown: {} } },
    {
      ...base,
      contextualNoteState: {
        ...base.contextualNoteState,
        item_a: { unknown: { status: 'unseen' } },
      },
    },
    {
      ...base,
      contextualNoteState: {
        ...base.contextualNoteState,
        item_a: { requestedChange: { status: 'other' } },
      },
    },
  ])
    assert.equal(store.save(key, candidate, null).code, 'invalid_data');
});

test('rejects unsafe, over-limit, and retained tombstone values', () => {
  const store = createDraftStore({
    storage: makeStorage(),
    schemaVersion: 1,
    contextSchema: schema,
  });
  for (const note of [
    { status: 'custom', value: 'reviewer@example.com' },
    { status: 'custom', value: 'x'.repeat(1001) },
    { status: 'dismissed', value: 'retained' },
  ]) {
    const contextualNoteState = state('unseen');
    contextualNoteState.item_a.requestedChange = note;
    const candidate = storedDraft({ suggestionVersion: 2, contextualNoteState });
    assert.equal(store.save(key, candidate, null).code, 'invalid_data');
  }
});
