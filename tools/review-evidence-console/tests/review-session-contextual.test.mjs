import assert from 'node:assert/strict';
import test from 'node:test';
import { createReviewSession } from '../public/src/state/review-session.mjs';
import { bundle } from './review-session-fixtures.mjs';

const recommendation = bundle.packet.items[0].suggestedReview.requestedChange;

test('change and block reveal an unseen requested-change recommendation', () => {
  for (const decision of ['change', 'block']) {
    const snapshot = createReviewSession(bundle).setDecision('item_a', decision);
    assert.equal(snapshot.decisions.item_a.requestedChange, recommendation);
    assert.deepEqual(snapshot.contextualNoteState.item_a.requestedChange, { status: 'suggested' });
  }
});

test('approve preserves requested-change draft text and contextual state', () => {
  const session = createReviewSession(bundle);
  session.setDecision('item_a', 'change');
  session.setField('item_a', 'requestedChange', '  Exact reviewer draft  ');
  const snapshot = session.setDecision('item_a', 'approve');
  assert.equal(snapshot.decisions.item_a.requestedChange, '  Exact reviewer draft  ');
  assert.deepEqual(snapshot.contextualNoteState.item_a.requestedChange, {
    status: 'custom', value: '  Exact reviewer draft  ',
  });
});

test('requested-change edits track suggested, custom, and dismissed state', () => {
  const session = createReviewSession(bundle);
  session.setDecision('item_a', 'change');
  const note = value => session.setField('item_a', 'requestedChange', value)
    .contextualNoteState.item_a.requestedChange;
  assert.deepEqual(note(recommendation), { status: 'suggested' });
  assert.deepEqual(note('Reviewer custom'), { status: 'custom', value: 'Reviewer custom' });
  assert.deepEqual(note(''), { status: 'dismissed' });
});

test('version-2 drafts round-trip custom, blank, and default behavior', () => {
  const scenarios = [
    [{ status: 'custom', value: '  Restored exact  ' }, '  Restored exact  '],
    [{ status: 'dismissed' }, ''],
    [{ status: 'unseen' }, recommendation],
  ];
  for (const [note, expected] of scenarios) {
    const draft = structuredClone(createReviewSession(bundle).getSnapshot());
    draft.decisions.item_a.requestedChange = note.status === 'custom' ? note.value : '';
    draft.contextualNoteState.item_a.requestedChange = note;
    const snapshot = createReviewSession(bundle, draft).setDecision('item_a', 'change');
    assert.equal(snapshot.decisions.item_a.requestedChange, expected);
  }
});

test('restored unseen or suggested state never overwrites nonempty reviewer text', () => {
  for (const status of ['unseen', 'suggested']) {
    const draft = structuredClone(createReviewSession(bundle).getSnapshot());
    draft.decisions.item_a.requestedChange = 'Existing reviewer text';
    draft.contextualNoteState.item_a.requestedChange = { status };
    const snapshot = createReviewSession(bundle, draft).setDecision('item_a', 'change');
    assert.equal(snapshot.decisions.item_a.requestedChange, 'Existing reviewer text');
    assert.deepEqual(snapshot.contextualNoteState.item_a.requestedChange, {
      status: 'custom', value: 'Existing reviewer text',
    });
  }
});

test('restored recommendation text may remain suggested', () => {
  const draft = structuredClone(createReviewSession(bundle).getSnapshot());
  draft.decisions.item_a.requestedChange = recommendation;
  draft.contextualNoteState.item_a.requestedChange = { status: 'unseen' };
  const snapshot = createReviewSession(bundle, draft).setDecision('item_a', 'block');
  assert.equal(snapshot.decisions.item_a.requestedChange, recommendation);
  assert.deepEqual(snapshot.contextualNoteState.item_a.requestedChange, { status: 'suggested' });
});

test('failed contextual field transition is atomic and silent', () => {
  let changes = 0;
  const session = createReviewSession(bundle, undefined, { onChange: () => changes++ });
  const before = session.getSnapshot();
  assert.throws(() => session.setField('item_a', 'requestedChange', 'reviewer@example.com'));
  assert.equal(session.getSnapshot(), before);
  assert.equal(session.getDecision('item_a').requestedChange, before.decisions.item_a.requestedChange);
  assert.equal(changes, 0);
});

test('failed contextual decision transition is atomic and silent', () => {
  let changes = 0;
  const unsafeBundle = structuredClone(bundle);
  unsafeBundle.packet.items[0].suggestedReview.requestedChange = 'x'.repeat(1001);
  const session = createReviewSession(unsafeBundle, undefined, { onChange: () => changes++ });
  const before = session.getSnapshot();
  assert.throws(() => session.setDecision('item_a', 'change'), /length|contextual/i);
  assert.equal(session.getSnapshot(), before);
  assert.equal(session.getDecision('item_a').decision, null);
  assert.equal(changes, 0);
});
