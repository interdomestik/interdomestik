import assert from 'node:assert/strict';
import test from 'node:test';
import { createAutosaveController } from '../public/src/app/autosave-controller.mjs';

test('conflicts only on a valid external revision newer than saved and pending local state', () => {
  const controller = createAutosaveController({
    store: { save: () => ({ ok: true }) },
    key: 'draft-key',
    editorId: 'tab-a',
    initialUpdatedAt: '2026-07-10T10:00:00.000Z',
    now: () => '2026-07-10T10:02:00.000Z',
    setTimer: () => 1,
    clearTimer: () => {},
  });
  controller.schedule({ decisions: {}, activeItem: 'item_a' });
  for (const updatedAt of [
    'bad',
    '2026-07-10T09:59:00.000Z',
    '2026-07-10T10:00:00.000Z',
    '2026-07-10T10:01:00.000Z',
  ]) {
    assert.equal(
      controller.handleStorage({
        key: 'draft-key',
        newValue: JSON.stringify({ editorId: 'tab-b', updatedAt }),
      }),
      false
    );
  }
  assert.equal(
    controller.handleStorage({
      key: 'draft-key',
      newValue: JSON.stringify({ editorId: 'tab-b', updatedAt: '2026-07-10T10:03:00.000Z' }),
    }),
    true
  );
});
