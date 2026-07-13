import { buildReceipt } from '../public/src/state/receipt-builder.mjs';

const item = (id, guidance = 'Use fixture guidance as editable prose.') => ({
  id,
  prompt: 'Who owns the fixture decision?',
  need: 'Fixture ownership is recorded.',
  repoImpact: 'Keeps the review boundary repo-safe.',
  guidance,
  baseFields: [
    'decision',
    'concreteAnswer',
    'reason',
    'evidenceRef',
    'verifiedAt',
    'riskCategory',
    'severity',
    'requestedChange',
  ],
  allowedRiskCategories: ['privacy'],
  requiredResponses: [
    {
      key: 'ownerRole',
      labelSq: 'Roli i pronarit',
      type: 'text',
      required: true,
      maxLength: 80,
      options: [],
      optionLabelsSq: {},
    },
  ],
  suggestedReview: {
    concreteAnswer: 'Keep the fixture boundary.',
    reason: 'The fixture authority supports this boundary.',
    evidenceRef: 'docs/fixture.md',
    riskCategory: 'privacy',
    severity: 'high',
    requestedChange: 'Document the requested change.',
    responses: {},
    useSessionDateFor: [],
  },
});

export const bundle = {
  assignment: {
    id: 'assign_a',
    packetId: 'packet_a',
    reviewerFixtureId: 'reviewer_a',
    reviewerRole: 'privacy',
    status: 'in_progress',
    dueDate: '2026-07-15',
    risk: 'high',
    titleSq: 'Rishikimi i autoritetit',
    purposeSq: 'Verifiko kufijtë e mostrës.',
    fixture: true,
  },
  reviewer: {
    id: 'reviewer_a',
    displayName: 'Privacy reviewer',
    role: 'privacy',
    repoSafe: true,
    draftScope: 'draft_account_a',
  },
  packet: {
    id: 'packet_a',
    version: '1',
    reviewerRole: 'privacy',
    title: 'Fixture review',
    scope: 'Repo-safe fixture scope.',
    stopConditions: ['Sensitive data supplied'],
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

export async function priorReceipt(overrides = {}) {
  const decisions = { item_a: completeDecision, item_b: completeDecision };
  const structuredResponses = {
    item_a: completeDecision.responses,
    item_b: completeDecision.responses,
  };
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
    decisions,
    structuredResponses,
    submittedAt: '2026-07-09T12:00:00.000Z',
    ...overrides,
  });
}
