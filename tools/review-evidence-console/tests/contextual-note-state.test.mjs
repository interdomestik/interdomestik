import assert from 'node:assert/strict';
import test from 'node:test';

import {
  initializeContextualNoteState,
  setContextualNote,
  setContextualNoteActive,
} from '../public/src/state/contextual-note-state.mjs';
import { suggestionBundle, storedDraft } from './suggestion-state-fixtures.mjs';

function bundleWithConditional() {
  const bundle = suggestionBundle();
  bundle.packet.items[0].suggestedReview.conditionalResponses = {
    ownerRole: 'Keep the exact safe owner role.',
  };
  return bundle;
}

test('fresh version-2 initialization creates unseen contextual notes', () => {
  const state = initializeContextualNoteState(bundleWithConditional());
  assert.deepEqual(state.item_a, {
    requestedChange: { status: 'unseen' },
    'responses.ownerRole': { status: 'unseen' },
  });
});

test('version-1 migration maps blank notes to dismissed and nonempty notes to custom', () => {
  const draft = storedDraft();
  draft.itemDecisions.item_b.requestedChange = '  Exact reviewer text  ';
  const state = initializeContextualNoteState(bundleWithConditional(), draft);
  assert.deepEqual(state.item_a.requestedChange, { status: 'dismissed' });
  assert.deepEqual(state.item_b.requestedChange, {
    status: 'custom',
    value: '  Exact reviewer text  ',
  });
});

test('unversioned legacy initialization preserves existing custom notes and leaves blanks unseen', () => {
  const draft = storedDraft();
  delete draft.suggestionVersion;
  draft.itemDecisions.item_b.requestedChange = 'Legacy exact';
  const state = initializeContextualNoteState(bundleWithConditional(), draft);
  assert.deepEqual(state.item_a.requestedChange, { status: 'unseen' });
  assert.deepEqual(state.item_b.requestedChange, { status: 'custom', value: 'Legacy exact' });
});

test('version-2 restoration preserves exact custom values and dismissed tombstones', () => {
  const draft = storedDraft({
    suggestionVersion: 2,
    contextualNoteState: {
      item_a: {
        requestedChange: { status: 'custom', value: '  exact custom  ' },
        'responses.ownerRole': { status: 'dismissed' },
      },
      item_b: { requestedChange: { status: 'dismissed' } },
    },
  });
  assert.deepEqual(initializeContextualNoteState(bundleWithConditional(), draft), draft.contextualNoteState);
});

test('inactive conditional custom values survive deactivate and reactivate exactly', () => {
  const initial = initializeContextualNoteState(bundleWithConditional());
  const custom = setContextualNote(initial, 'item_a', 'responses.ownerRole', '  custom value  ', {
    suggestion: 'Keep the exact safe owner role.',
  });
  const inactive = setContextualNoteActive(custom, 'item_a', 'responses.ownerRole', false);
  const active = setContextualNoteActive(inactive.noteState, 'item_a', 'responses.ownerRole', true, {
    suggestion: 'Keep the exact safe owner role.',
  });
  assert.deepEqual(active.noteState.item_a['responses.ownerRole'], {
    status: 'custom',
    value: '  custom value  ',
  });
  assert.equal(active.value, '  custom value  ');
});

test('note edits reject unsafe and over-limit custom text without changing state', () => {
  const initial = initializeContextualNoteState(bundleWithConditional());
  for (const value of ['reviewer@example.com', 'https://private.example', 'Bearer secret', '123456789']) {
    assert.throws(
      () =>
        setContextualNote(initial, 'item_a', 'responses.ownerRole', value, {
          suggestion: 'Keep the exact safe owner role.',
          maxLength: 8,
        }),
      /safe|length/i
    );
    assert.deepEqual(initial.item_a['responses.ownerRole'], { status: 'unseen' });
  }
});

test('activating an unseen note returns its recommendation and suggested state atomically', () => {
  const initial = initializeContextualNoteState(bundleWithConditional());
  const active = setContextualNoteActive(initial, 'item_a', 'responses.ownerRole', true, {
    suggestion: 'Keep the exact safe owner role.',
  });
  assert.equal(active.value, 'Keep the exact safe owner role.');
  assert.deepEqual(active.noteState.item_a['responses.ownerRole'], { status: 'suggested' });
  assert.deepEqual(initial.item_a['responses.ownerRole'], { status: 'unseen' });
});

test('returned state snapshots are deeply immutable', () => {
  const state = initializeContextualNoteState(bundleWithConditional());
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.item_a), true);
  assert.equal(Object.isFrozen(state.item_a.requestedChange), true);
  assert.throws(() => {
    state.item_a.requestedChange.status = 'custom';
  }, TypeError);
});

test('unsupported and malformed version-2 state is rejected', () => {
  assert.throws(
    () => initializeContextualNoteState(bundleWithConditional(), storedDraft({ suggestionVersion: 3 })),
    /version/i
  );
  assert.throws(
    () =>
      initializeContextualNoteState(
        bundleWithConditional(),
        storedDraft({
          suggestionVersion: 2,
          contextualNoteState: { item_a: { requestedChange: { status: 'custom' } } },
        })
      ),
    /contextual/i
  );
});
