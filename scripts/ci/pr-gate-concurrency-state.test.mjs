import assert from 'node:assert/strict';
import test from 'node:test';

function expectedGroup(workflow, event) {
  const prefix = `${workflow}-${event.pullNumber}-${event.head}`;
  if (workflow === 'pr-delivery-gate') {
    const admitted =
      event.base === 'main' &&
      event.state === 'open' &&
      !event.draft &&
      (event.action !== 'labeled' || event.label === 'full-gate');
    if (!admitted) return `${prefix}-deferred-${event.runId}`;
    return `${prefix}-${event.sameRepository ? 'same-repository' : 'fork'}`;
  }
  const fullFeedback =
    event.name !== 'pull_request' &&
    event.sameRepository &&
    event.base === 'main' &&
    event.state === 'open' &&
    !event.draft;
  return fullFeedback ? `${prefix}-full-feedback` : `${prefix}-deferred-${event.runId}`;
}

test('workflow groups combine admission, head, and trust-origin state', () => {
  const base = {
    pullNumber: 1761,
    head: 'a'.repeat(40),
    sameRepository: true,
    runId: 10,
    action: 'synchronize',
    label: '',
    base: 'main',
    state: 'open',
    draft: false,
  };
  const lifecycle = { ...base, name: 'pull_request' };
  const review = { ...base, name: 'pull_request_review', runId: 11 };
  const comment = { ...base, name: 'pull_request_review_comment', runId: 12 };

  assert.equal(
    expectedGroup('pr-delivery-gate', lifecycle),
    expectedGroup('pr-delivery-gate', review)
  );
  assert.equal(
    expectedGroup('pr-delivery-gate', review),
    expectedGroup('pr-delivery-gate', comment)
  );
  assert.notEqual(
    expectedGroup('pr-delivery-gate', review),
    expectedGroup('pr-delivery-gate', {
      ...lifecycle,
      action: 'labeled',
      label: 'bug',
      runId: 13,
    }),
    'an ordinary label cannot preempt the complete delivery snapshot'
  );
  assert.equal(
    expectedGroup('pr-delivery-gate', review),
    expectedGroup('pr-delivery-gate', {
      ...lifecycle,
      action: 'labeled',
      label: 'full-gate',
    })
  );

  assert.equal(expectedGroup('pr-finalizer', review), expectedGroup('pr-finalizer', comment));
  assert.notEqual(
    expectedGroup('pr-finalizer', lifecycle),
    expectedGroup('pr-finalizer', review),
    'a possibly deferred lifecycle event cannot preempt full feedback validation'
  );

  const forkLifecycle = { ...lifecycle, sameRepository: false };
  const forkReview = { ...review, sameRepository: false };
  const forkComment = { ...comment, sameRepository: false };
  assert.notEqual(
    expectedGroup('pr-finalizer', forkLifecycle),
    expectedGroup('pr-finalizer', forkReview)
  );
  assert.notEqual(
    expectedGroup('pr-finalizer', forkReview),
    expectedGroup('pr-finalizer', forkComment)
  );
  assert.equal(
    expectedGroup('pr-delivery-gate', forkLifecycle),
    expectedGroup('pr-delivery-gate', forkReview),
    'fork delivery events are equally trusted read-only snapshot refreshes'
  );

  for (const workflow of ['pr-delivery-gate', 'pr-finalizer']) {
    assert.notEqual(
      expectedGroup(workflow, review),
      expectedGroup(workflow, { ...review, head: 'b'.repeat(40) })
    );
  }
});
