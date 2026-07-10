export const reviewer = {
  id: 'reviewer_privacy_mk',
  displayName: 'Privacy reviewer',
  role: 'privacy',
  repoSafe: true,
};

export const assignments = [
  {
    id: 'assign_mob03a_part_a',
    packetId: 'mob-03a-part-a',
    reviewerFixtureId: reviewer.id,
    reviewerRole: 'privacy',
    status: 'in_progress',
    dueDate: '2026-07-15',
    risk: 'high',
    titleSq: 'Rishikimi i autoritetit — Pjesa A',
    purposeSq: 'Verifiko privatësinë, pëlqimin dhe qasjen.',
    fixture: true,
  },
  {
    id: 'assign_mob03a_part_b',
    packetId: 'mob-03a-part-b',
    reviewerFixtureId: reviewer.id,
    reviewerRole: 'privacy',
    status: 'not_started',
    dueDate: '2026-07-16',
    risk: 'medium',
    titleSq: 'Rishikimi i autoritetit — Pjesa B',
    purposeSq: 'Verifiko dokumentet, kërcënimet dhe ndalimet.',
    fixture: true,
  },
];

const item = {
  id: 'M03A-PRIVACY-OWNER',
  prompt: 'Who owns the fixture decision?',
  need: 'Fixture ownership is recorded.',
  repoImpact: 'Keeps the review boundary repo-safe.',
  guidance: 'Use a fixture role only.',
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
  allowedRiskCategories: ['privacy', 'legal'],
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
};

export const partA = {
  id: 'mob-03a-part-a',
  version: '1',
  reviewerRole: 'privacy',
  title: 'MOB-03a fixture authority review',
  scope: 'Repo-safe car and property display planning only.',
  stopConditions: ['Sensitive data supplied'],
  itemIds: ['M03A-PRIVACY-OWNER', 'M03A-MEDICAL-BOUNDARY'],
  items: [item, { ...item, id: 'M03A-MEDICAL-BOUNDARY' }],
};

const fixtures = new Map([
  ['/data/reviewers.json', [reviewer]],
  ['/data/assignments.json', assignments],
  ['/data/packets/mob-03a-part-a.json', partA],
  [
    '/data/packets/mob-03a-part-b.json',
    { ...partA, id: 'mob-03a-part-b', packetId: 'mob-03a-part-b' },
  ],
]);

export const fakeLoader = async path => structuredClone(fixtures.get(path));

export const baseItem = { id: 'item', requiredResponses: [] };

export const medicalItem = {
  id: 'medical',
  requiredResponses: [
    { key: 'medicalBoundary', type: 'option', required: true, options: ['allowed', 'excluded'] },
    {
      key: 'dpiaRef',
      type: 'evidenceRef',
      requiredWhen: { key: 'medicalBoundary', equals: 'allowed' },
    },
    {
      key: 'disabledScope',
      type: 'text',
      maxLength: 240,
      requiredWhen: { key: 'medicalBoundary', equals: 'excluded' },
    },
  ],
};

export const completeDecision = (overrides = {}) => ({
  decision: 'approve',
  concreteAnswer: 'Approved for the fixture boundary.',
  reason: 'The source authority supports this decision.',
  evidenceRef: 'docs/product/packet.md#L21',
  verifiedAt: '2026-07-09',
  riskCategory: 'privacy',
  severity: 'high',
  requestedChange: '',
  responses: {},
  ...overrides,
});
