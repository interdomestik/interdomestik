import { buildReceipt } from '../public/src/state/receipt-builder.mjs';

const item = (id, guidance = 'Use fixture guidance as editable prose.') => ({
  id,
  guidance,
  allowedRiskCategories: ['privacy'],
  requiredResponses: [
    { key: 'ownerRole', type: 'text', required: true, maxLength: 80, options: [] },
  ],
});

export const bundle = {
  assignment: {
    id: 'assign_a',
    packetId: 'packet_a',
    reviewerFixtureId: 'reviewer_a',
    reviewerRole: 'privacy',
  },
  reviewer: { id: 'reviewer_a', displayName: 'Privacy reviewer', role: 'privacy' },
  packet: {
    id: 'packet_a',
    version: '1',
    reviewerRole: 'privacy',
    itemIds: ['item_a', 'item_b'],
    items: [item('item_a'), item('item_b', 'Second fixture guidance.')],
  },
};

export const completeDecision = {
  decision: 'approve',
  concreteAnswer: 'Approved inside the fixture boundary.',
  reason: 'The repo-safe source supports the decision.',
  evidenceRef: 'docs/product/packet.md#L21',
  verifiedAt: '2026-07-09',
  riskCategory: 'privacy',
  severity: 'high',
  requestedChange: '',
  responses: { ownerRole: 'Privacy lead' },
};

export async function priorReceipt() {
  return buildReceipt({
    schemaVersion: 1,
    packetId: bundle.packet.id,
    packetVersion: bundle.packet.version,
    assignmentId: bundle.assignment.id,
    reviewerFixtureId: bundle.reviewer.id,
    reviewerDisplayName: bundle.reviewer.displayName,
    reviewerRole: bundle.reviewer.role,
    packetRole: bundle.packet.reviewerRole,
    authorityDisclaimer: 'Fixture authority only; no production decision.',
    decisions: { item_a: completeDecision },
    structuredResponses: { item_a: completeDecision.responses },
    submittedAt: '2026-07-09T12:00:00.000Z',
  });
}
