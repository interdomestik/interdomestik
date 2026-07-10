import assert from 'node:assert/strict';
import test from 'node:test';

import { createAutosaveController } from '../public/src/app/autosave-controller.mjs';

test('debounced autosave persists packet acknowledgement and restores active item', () => {
  const calls = [];
  const timers = [];
  const controller = createAutosaveController({
    store: { save: (...args) => (calls.push(args), { ok: true, value: args[1] }) },
    key: 'draft-key',
    editorId: 'tab-a',
    now: () => '2026-07-10T10:00:00.000Z',
    setTimer: callback => (timers.push(callback), timers.length),
    clearTimer: () => {},
    onStatus: status => calls.push(status),
  });
  controller.schedule({
    assignmentId: 'a',
    packetId: 'p',
    packetVersion: '1',
    reviewerFixtureId: 'r',
    activeItem: 'item_b',
    decisions: {},
    safeEvidenceConfirmed: true,
  });
  assert.equal(calls[0], 'Saving');
  timers[0]();
  assert.equal(calls.at(-1), 'Saved at 12:00');
  assert.equal(calls[1][1].safeEvidenceConfirmed, true);
  assert.equal(calls[1][1].activeItem, 'item_b');
});

test('quota failure stays failed and storage conflict stops later autosaves', () => {
  const statuses = [];
  let timer;
  const controller = createAutosaveController({
    store: { save: () => ({ ok: false, code: 'quota', message: 'Full.' }) },
    key: 'draft-key',
    editorId: 'tab-a',
    now: () => '2026-07-10T10:00:00.000Z',
    setTimer: callback => (timer = callback),
    clearTimer: () => {},
    onStatus: value => statuses.push(value),
  });
  controller.schedule(draft());
  timer();
  assert.equal(statuses.at(-1), 'Save failed — retry');
  controller.handleStorage({
    key: 'draft-key',
    newValue: JSON.stringify({ editorId: 'tab-b', updatedAt: '2026-07-10T10:01:00.000Z' }),
  });
  assert.equal(controller.isConflicted(), true);
  assert.equal(statuses.at(-1), 'Conflict — choose reload or export');
  assert.equal(controller.schedule(draft()), false);
});

test('restored draft passes its exact revision into the first save', () => {
  let timer;
  let expected;
  const controller = createAutosaveController({
    store: {
      save: (_key, _draft, revision) => {
        expected = revision;
        return { ok: true };
      },
    },
    key: 'draft-key',
    editorId: 'tab-a',
    initialUpdatedAt: '2026-07-10T09:00:00.000Z',
    setTimer: callback => (timer = callback),
    clearTimer: () => {},
  });
  controller.schedule(draft());
  timer();
  assert.equal(expected, '2026-07-10T09:00:00.000Z');
});

function draft() {
  return {
    assignmentId: 'a',
    packetId: 'p',
    packetVersion: '1',
    reviewerFixtureId: 'r',
    activeItem: 'item_a',
    decisions: {},
    safeEvidenceConfirmed: false,
  };
}
