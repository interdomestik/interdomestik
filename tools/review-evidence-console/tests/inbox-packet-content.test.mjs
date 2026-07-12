import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReceipt, verifyReceipt } from '../public/src/state/receipt-builder.mjs';
import { loadInboxRows } from '../public/src/views/inbox-data.mjs';

const reviewer = { id: 'reviewer_a', role: 'governance' };
const item = {
  id: 'ITEM-1',
  baseFields: [
    'decision',
    'concreteAnswer',
    'reason',
    'evidenceRef',
    'verifiedAt',
    'riskCategory',
    'severity',
  ],
  allowedRiskCategories: ['privacy'],
  requiredResponses: [{ key: 'ownerRole', type: 'text', required: true, maxLength: 80 }],
};
const decision = {
  decision: 'approve',
  concreteAnswer: 'Kufiri është kontrolluar.',
  reason: 'Autoriteti përputhet me paketën.',
  evidenceRef: 'docs/product/evidence.md',
  verifiedAt: '2026-07-11',
  riskCategory: 'privacy',
  severity: 'high',
};
const first = {
  assignment: {
    id: 'assign_a',
    packetId: 'packet_a',
    reviewerFixtureId: reviewer.id,
    reviewerRole: reviewer.role,
    status: 'not_started',
    titleSq: 'Title A',
    purposeSq: 'Purpose A',
    continuesWithAssignmentId: 'assign_b',
  },
  reviewer,
  packet: {
    id: 'packet_a',
    version: '3',
    reviewerRole: reviewer.role,
    itemIds: [item.id],
    items: [item],
  },
};
const second = {
  assignment: {
    ...first.assignment,
    id: 'assign_b',
    packetId: 'packet_b',
    titleSq: 'Title B',
    purposeSq: 'Purpose B',
    continuesWithAssignmentId: undefined,
  },
  reviewer,
  packet: { id: 'packet_b', version: '3', reviewerRole: reviewer.role, itemIds: ['ITEM-2'] },
};

const repository = {
  listAssignments: async () => ({ ok: true, value: [first.assignment, second.assignment] }),
  loadAssignmentBundle: async id => ({
    ok: true,
    value: id === first.assignment.id ? first : second,
  }),
};

async function receiptFor(decisions, structuredResponses) {
  return buildReceipt({
    schemaVersion: 1,
    packetId: first.packet.id,
    packetVersion: first.packet.version,
    assignmentId: first.assignment.id,
    reviewerFixtureId: reviewer.id,
    reviewerDisplayName: 'Reviewer A',
    reviewerRole: reviewer.role,
    packetRole: first.packet.reviewerRole,
    authorityDisclaimer: 'Advisory evidence only.',
    decisions,
    structuredResponses,
    submittedAt: '2026-07-10T00:00:00.000Z',
  });
}

test('packet-incomplete verified receipt cannot submit or unlock continuation', async () => {
  const receipt = await receiptFor({ [item.id]: decision }, { [item.id]: {} });
  assert.equal((await verifyReceipt(receipt)).ok, true);
  const result = await loadInboxRows(repository, reviewer.id, {
    listAll: async () => ({ ok: true, value: [receipt] }),
  });
  assert.equal(result.value[0].submissionStatus, null);
  assert.equal(result.value[0].receiptId, undefined);
  assert.equal(result.value[1].nextAction, undefined);
});

test('packet-complete built receipt still submits and unlocks continuation', async () => {
  const receipt = await receiptFor(
    { [item.id]: decision },
    { [item.id]: { ownerRole: 'Legal / Privacy Authority' } }
  );
  const result = await loadInboxRows(repository, reviewer.id, {
    listAll: async () => ({ ok: true, value: [receipt] }),
  });
  assert.equal(result.value[0].submissionStatus, 'submitted');
  assert.equal(result.value[0].receiptId, receipt.receiptId);
  assert.equal(result.value[1].nextAction, true);
});
