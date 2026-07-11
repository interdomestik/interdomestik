import assert from 'node:assert/strict';
import test from 'node:test';
import { createReviewSession } from '../public/src/state/review-session.mjs';
import { bundleWithDescriptors, descriptor, medicalDescriptors } from './conditional-fixtures.mjs';

function sessionWith(responses, descriptors = medicalDescriptors, options = {}) {
  const bundle = bundleWithDescriptors(descriptors);
  if (descriptors.some(item => item.key === 'disabledScope')) {
    bundle.packet.items[0].suggestedReview.conditionalResponses = {
      disabledScope: 'Default disabled scope.',
    };
  }
  return createReviewSession(
    bundle,
    { decisions: { item_a: { responses } } },
    { applySuggestions: false, ...options }
  );
}

for (const scenario of [
  {
    name: 'excluded to allowed removes disabledScope',
    before: { medicalBoundary: 'excluded', disabledScope: 'Disable medical data.' },
    next: 'allowed',
    removed: 'disabledScope',
  },
  {
    name: 'allowed to excluded removes dpiaRef',
    before: { medicalBoundary: 'allowed', dpiaRef: 'docs/dpia.md' },
    next: 'excluded',
    removed: 'dpiaRef',
  },
]) {
  test(`${scenario.name}, preserves unrelated responses, and keeps snapshots immutable`, () => {
    const session = sessionWith({ ...scenario.before, reviewerNote: 'Keep this note.' });
    const before = session.getSnapshot();
    const after = session.setResponse('item_a', 'medicalBoundary', scenario.next);

    assert.equal(after.decisions.item_a.responses[scenario.removed], undefined);
    assert.equal(after.decisions.item_a.responses.reviewerNote, 'Keep this note.');
    assert.deepEqual(before.decisions.item_a.responses, {
      ...scenario.before,
      reviewerNote: 'Keep this note.',
    });
    assert.equal(Object.isFrozen(after.decisions.item_a.responses), true);
    assert.throws(() => (after.decisions.item_a.responses.reviewerNote = 'mutated'));
  });
}

test('conditional chains prune to a stable result independent of descriptor order', () => {
  const descriptors = [
    descriptor('leaf', { requiredWhen: { key: 'middle', equals: 'present' } }),
    descriptor('middle', {
      type: 'select',
      options: ['present', 'absent'],
      requiredWhen: { key: 'controller', equals: 'on' },
    }),
    descriptor('controller', { type: 'select', options: ['on', 'off'] }),
    descriptor('reviewerNote'),
  ];
  const session = sessionWith(
    { controller: 'on', middle: 'present', leaf: 'stale', reviewerNote: 'Keep.' },
    descriptors
  );
  const responses = session.setResponse('item_a', 'controller', 'off').decisions.item_a.responses;
  assert.deepEqual(responses, { controller: 'off', reviewerNote: 'Keep.' });
});

test('conditional contextual notes restore custom values and dismissed tombstones', () => {
  const custom = sessionWith({ medicalBoundary: 'excluded' });
  custom.setResponse('item_a', 'disabledScope', '  Exact custom scope  ');
  custom.setResponse('item_a', 'medicalBoundary', 'allowed');
  let snapshot = custom.setResponse('item_a', 'medicalBoundary', 'excluded');
  assert.equal(snapshot.decisions.item_a.responses.disabledScope, '  Exact custom scope  ');
  assert.deepEqual(snapshot.contextualNoteState.item_a['responses.disabledScope'], {
    status: 'custom',
    value: '  Exact custom scope  ',
  });

  const dismissed = sessionWith({ medicalBoundary: 'excluded' });
  dismissed.setResponse('item_a', 'disabledScope', '');
  dismissed.setResponse('item_a', 'medicalBoundary', 'allowed');
  snapshot = dismissed.setResponse('item_a', 'medicalBoundary', 'excluded');
  assert.equal(snapshot.decisions.item_a.responses.disabledScope, '');
  assert.deepEqual(snapshot.contextualNoteState.item_a['responses.disabledScope'], {
    status: 'dismissed',
  });
});

test('conditional activation applies defaults only to unseen or suggested notes', () => {
  const session = sessionWith({ medicalBoundary: 'allowed' });
  const snapshot = session.setResponse('item_a', 'medicalBoundary', 'excluded');
  assert.equal(snapshot.decisions.item_a.responses.disabledScope, 'Default disabled scope.');
  assert.deepEqual(snapshot.contextualNoteState.item_a['responses.disabledScope'], {
    status: 'suggested',
  });
});

test('dpiaRef is never defaulted and ordinary pruning remains intact', () => {
  const session = sessionWith({ medicalBoundary: 'excluded', disabledScope: 'Keep disabled.' });
  const snapshot = session.setResponse('item_a', 'medicalBoundary', 'allowed');
  assert.equal(snapshot.decisions.item_a.responses.disabledScope, undefined);
  assert.equal(snapshot.decisions.item_a.responses.dpiaRef, undefined);
});

test('failed contextual response transition is atomic and silent', () => {
  let changes = 0;
  const observed = sessionWith({ medicalBoundary: 'excluded' }, medicalDescriptors, {
    onChange: () => changes++,
  });
  const before = observed.getSnapshot();
  assert.throws(
    () => observed.setResponse('item_a', 'disabledScope', 'reviewer@example.com'),
    /safe|contextual/i
  );
  assert.equal(observed.getSnapshot(), before);
  assert.equal(observed.getDecision('item_a').responses.disabledScope, undefined);
  assert.equal(changes, 0);
});
