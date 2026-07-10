import assert from 'node:assert/strict';
import test from 'node:test';
import { createSubmissionController } from '../public/src/app/submission-controller.mjs';
import { baseItem, completeDecision } from './validation-fixtures.mjs';

const bundle = {
  assignment: { id: 'assign_a' },
  reviewer: { id: 'reviewer_a', displayName: 'Ada Reviewer', role: 'privacy' },
  packet: { id: 'packet_a', version: 'v1', reviewerRole: 'privacy', items: [baseItem] },
};
const state = {
  decisions: {
    item: completeDecision({ responses: {} }),
  },
};

test('awaits receipt save before navigating and ignores duplicate submission', async () => {
  const events = [];
  let release;
  const pending = new Promise(resolve => (release = resolve));
  const controller = createSubmissionController({
    bundle,
    authorityDisclaimer: 'Advisory evidence only.',
    buildReceipt: async input => (events.push(['build', input]), { receiptId: 'rec_abc' }),
    receiptStore: {
      save: async receipt => (
        events.push(['save', receipt]),
        await pending,
        { ok: true, value: receipt }
      ),
    },
    onNavigate: id => events.push(['navigate', id]),
  });
  const first = controller.submit(state, true);
  assert.equal(controller.getStatus().submitting, true);
  assert.deepEqual(await controller.submit(state, true), { ok: false, code: 'submitting' });
  release();
  assert.equal((await first).ok, true);
  assert.equal(events.at(-1)[0], 'navigate');
  assert.deepEqual(events[0][1].structuredResponses, { item: {} });
  assert.equal(events[0][1].authorityDisclaimer, 'Advisory evidence only.');
  assert.equal(events[0][1].decisions.item.decision, 'approve');
  assert.equal(events[0][1].decisions.item.severity, 'high');
});

test('keeps the canonical default authority disclaimer in the receipt input', async () => {
  let input;
  const controller = createSubmissionController({
    bundle,
    buildReceipt: async value => ((input = value), { receiptId: 'rec_abc' }),
    receiptStore: { save: async receipt => ({ ok: true, value: receipt }) },
  });
  await controller.submit(state, true);
  assert.equal(input.authorityDisclaimer, 'Local fixture review only; not runtime authority.');
});

test('requires safe evidence and preserves state when save fails', async () => {
  const controller = createSubmissionController({
    bundle,
    buildReceipt: async () => ({ receiptId: 'rec_abc' }),
    receiptStore: {
      save: async () => ({ ok: false, code: 'unavailable', message: 'Storage unavailable.' }),
    },
  });
  assert.equal((await controller.submit(state, false)).code, 'validation_failed');
  const failed = await controller.submit(state, true);
  assert.equal(failed.code, 'unavailable');
  assert.equal(controller.getStatus().submitting, false);
  assert.deepEqual(state.decisions.item.responses, {});
});

test('defensively rejects an incomplete packet without building or saving', async () => {
  let builds = 0;
  let saves = 0;
  const controller = createSubmissionController({
    bundle,
    buildReceipt: async () => builds++,
    receiptStore: { save: async () => saves++ },
  });
  const result = await controller.submit(
    { decisions: { item: { ...completeDecision(), reason: '' } } },
    true
  );
  assert.equal(result.code, 'validation_failed');
  assert.equal(builds, 0);
  assert.equal(saves, 0);
});
