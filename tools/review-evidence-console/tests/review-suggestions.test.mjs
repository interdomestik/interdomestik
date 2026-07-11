import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeSuggestedDecisions } from '../public/src/state/review-suggestions.mjs';
import { suggestionBundle, storedDraft } from './suggestion-state-fixtures.mjs';

const localDate = counter => () => {
  counter.calls += 1;
  return '2026-07-10';
};

test('fresh state applies every allowed suggestion once without manual controls', () => {
  const counter = { calls: 0 };
  const result = initializeSuggestedDecisions(suggestionBundle(), undefined, {
    getLocalDate: localDate(counter),
  });
  assert.equal(result.suggestionVersion, 2);
  assert.equal(result.contextualNoteState.item_a.requestedChange.status, 'unseen');
  assert.equal(counter.calls, 1);
  for (const decision of Object.values(result.decisions)) {
    assert.match(decision.concreteAnswer, /^Answer for item_/);
    assert.equal(decision.verifiedAt, '2026-07-10');
    assert.equal(decision.responses.reviewedAt, '2026-07-10');
    assert.deepEqual(decision.responses.areas, ['one', 'two']);
    assert.equal(decision.decision, null);
    assert.equal(decision.requestedChange, '');
  }
});

test('version-1 draft restores exact reviewer values without reading the date', () => {
  const draft = storedDraft();
  draft.itemDecisions.item_a.concreteAnswer = '';
  draft.itemDecisions.item_a.responses = { areas: [] };
  const counter = { calls: 0 };
  const result = initializeSuggestedDecisions(suggestionBundle(), draft, {
    getLocalDate: localDate(counter),
  });
  assert.equal(counter.calls, 0);
  assert.equal(result.decisions.item_a.concreteAnswer, '');
  assert.deepEqual(result.decisions.item_a.responses.areas, []);
  assert.equal(result.decisions.item_a.responses.ownerRole, undefined);
});

test('legacy draft fills absent own fields and nested responses only', () => {
  const draft = storedDraft({ suggestionVersion: undefined });
  delete draft.suggestionVersion;
  const item = draft.itemDecisions.item_a;
  item.concreteAnswer = '';
  item.responses = { ownerRole: '', areas: [] };
  delete item.reason;
  const counter = { calls: 0 };
  const result = initializeSuggestedDecisions(suggestionBundle(), draft, {
    getLocalDate: localDate(counter),
  });
  assert.equal(counter.calls, 1);
  assert.equal(result.suggestionVersion, 2);
  assert.equal(result.decisions.item_a.concreteAnswer, '');
  assert.equal(result.decisions.item_a.reason, 'Reason for item_a.');
  assert.equal(result.decisions.item_a.responses.ownerRole, '');
  assert.deepEqual(result.decisions.item_a.responses.areas, []);
  assert.equal(result.decisions.item_a.responses.reviewedAt, '2026-07-10');
});

test('suggestion bypass initializes only version metadata and never reads the date', () => {
  const counter = { calls: 0 };
  const result = initializeSuggestedDecisions(suggestionBundle(), undefined, {
    applySuggestions: false,
    getLocalDate: localDate(counter),
  });
  assert.equal(counter.calls, 0);
  assert.equal(result.suggestionVersion, 2);
  assert.equal(result.decisions.item_a.concreteAnswer, '');
  assert.deepEqual(result.decisions.item_a.responses, {});
});

test('unsupported owned suggestion version fails before reading the date', () => {
  const counter = { calls: 0 };
  assert.throws(
    () =>
      initializeSuggestedDecisions(suggestionBundle(), storedDraft({ suggestionVersion: 3 }), {
        getLocalDate: localDate(counter),
      }),
    /version/i
  );
  assert.equal(counter.calls, 0);
});

test('rejects invalid or impossible injected calendar dates', () => {
  for (const value of ['2026-7-10', '2026-02-29', '2026-13-01', 'not-a-date']) {
    assert.throws(
      () => initializeSuggestedDecisions(suggestionBundle(), undefined, { getLocalDate: () => value }),
      /date/i
    );
  }
});
