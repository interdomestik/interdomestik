import assert from 'node:assert/strict';
import test from 'node:test';
import { createSubmissionController } from '../public/src/app/submission-controller.mjs';

const bundle = {
  assignment: { id: 'assign_a' },
  reviewer: { id: 'reviewer_a', displayName: 'Ada Reviewer', role: 'privacy' },
  packet: { id: 'packet_a', version: 'v1', reviewerRole: 'privacy' },
};
const state = {
  decisions: {
    item_a: {
      decision: 'approve',
      reason: 'Complete.',
      severity: 'low',
      riskCategory: 'privacy',
      responses: { owner: 'Privacy' },
    },
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
  assert.deepEqual(events[0][1].structuredResponses, { item_a: { owner: 'Privacy' } });
});

test('requires safe evidence and preserves state when save fails', async () => {
  const controller = createSubmissionController({
    bundle,
    buildReceipt: async () => ({ receiptId: 'rec_abc' }),
    receiptStore: {
      save: async () => ({ ok: false, code: 'unavailable', message: 'Storage unavailable.' }),
    },
  });
  assert.equal((await controller.submit(state, false)).code, 'unsafe');
  const failed = await controller.submit(state, true);
  assert.equal(failed.code, 'unavailable');
  assert.equal(controller.getStatus().submitting, false);
  assert.equal(state.decisions.item_a.responses.owner, 'Privacy');
});
