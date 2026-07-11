import assert from 'node:assert/strict';
import test from 'node:test';
import { createReviewSession } from '../public/src/state/review-session.mjs';
import { bundleWithDescriptors, medicalDescriptors } from './conditional-fixtures.mjs';

const recommendation = 'Default disabled scope.';

function conditionalBundle() {
  const bundle = bundleWithDescriptors(medicalDescriptors);
  bundle.packet.items[0].suggestedReview.conditionalResponses = {
    disabledScope: recommendation,
  };
  return bundle;
}

function restoredSession(status, value) {
  const bundle = conditionalBundle();
  const seed = createReviewSession(bundle, undefined, { applySuggestions: false }).getSnapshot();
  const draft = structuredClone(seed);
  draft.decisions.item_a.responses = { medicalBoundary: 'excluded', disabledScope: value };
  draft.contextualNoteState.item_a['responses.disabledScope'] = { status };
  return createReviewSession(bundle, draft, { applySuggestions: false });
}

for (const status of ['unseen', 'suggested', 'dismissed']) {
  test(`restored ${status} sidecar preserves nonempty conditional text on unrelated edits`, () => {
    const session = restoredSession(status, '  Exact reviewer scope  ');
    const snapshot = session.setResponse('item_a', 'reviewerNote', 'Unrelated note');
    assert.equal(snapshot.decisions.item_a.responses.disabledScope, '  Exact reviewer scope  ');
    assert.deepEqual(snapshot.contextualNoteState.item_a['responses.disabledScope'], {
      status: 'custom',
      value: '  Exact reviewer scope  ',
    });
  });

  test(`restored ${status} sidecar preserves conditional text through reactivation`, () => {
    const session = restoredSession(status, '  Exact reviewer scope  ');
    session.setResponse('item_a', 'medicalBoundary', 'allowed');
    const snapshot = session.setResponse('item_a', 'medicalBoundary', 'excluded');
    assert.equal(snapshot.decisions.item_a.responses.disabledScope, '  Exact reviewer scope  ');
    assert.deepEqual(snapshot.contextualNoteState.item_a['responses.disabledScope'], {
      status: 'custom',
      value: '  Exact reviewer scope  ',
    });
  });
}

test('restored exact conditional recommendation reconciles to suggested', () => {
  const session = restoredSession('dismissed', recommendation);
  const snapshot = session.setResponse('item_a', 'reviewerNote', 'Unrelated note');
  assert.equal(snapshot.decisions.item_a.responses.disabledScope, recommendation);
  assert.deepEqual(snapshot.contextualNoteState.item_a['responses.disabledScope'], {
    status: 'suggested',
  });
});
