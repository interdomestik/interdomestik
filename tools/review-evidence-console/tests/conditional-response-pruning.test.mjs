import assert from 'node:assert/strict';
import test from 'node:test';
import { createReviewSession } from '../public/src/state/review-session.mjs';
import { bundleWithDescriptors, descriptor, medicalDescriptors } from './conditional-fixtures.mjs';

function sessionWith(responses, descriptors = medicalDescriptors) {
  return createReviewSession(
    bundleWithDescriptors(descriptors),
    { decisions: { item_a: { responses } } },
    { applySuggestions: false }
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
