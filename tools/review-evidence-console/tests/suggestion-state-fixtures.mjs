import { bundle as baseBundle } from './review-session-fixtures.mjs';

export function suggestionBundle() {
  const bundle = structuredClone(baseBundle);
  for (const item of bundle.packet.items) {
    item.requiredResponses = [
      {
        key: 'ownerRole',
        labelSq: 'Roli',
        type: 'text',
        required: true,
        maxLength: 80,
        options: [],
        optionLabelsSq: {},
      },
      {
        key: 'areas',
        labelSq: 'Fushat',
        type: 'multi_select',
        required: true,
        maxLength: 80,
        options: ['one', 'two'],
        optionLabelsSq: { one: 'Një', two: 'Dy' },
      },
      {
        key: 'reviewedAt',
        labelSq: 'Data',
        type: 'date',
        required: true,
        maxLength: 10,
        options: [],
        optionLabelsSq: {},
      },
    ];
    item.suggestedReview = {
      concreteAnswer: `Answer for ${item.id}.`,
      reason: `Reason for ${item.id}.`,
      evidenceRef: `docs/${item.id}.md`,
      riskCategory: 'privacy',
      severity: 'high',
      requestedChange: `Requested change for ${item.id}.`,
      responses: { ownerRole: 'Privacy lead', areas: ['one', 'two'] },
      useSessionDateFor: ['verifiedAt', 'reviewedAt'],
    };
  }
  return bundle;
}

export function storedDraft(overrides = {}) {
  const bundle = suggestionBundle();
  const itemDecisions = Object.fromEntries(
    bundle.packet.itemIds.map(itemId => [
      itemId,
      {
        decision: null,
        concreteAnswer: '',
        reason: '',
        evidenceRef: '',
        verifiedAt: '',
        riskCategory: '',
        severity: '',
        requestedChange: '',
        responses: {},
      },
    ])
  );
  return {
    schemaVersion: 1,
    suggestionVersion: 1,
    assignmentId: bundle.assignment.id,
    packetId: bundle.packet.id,
    reviewerFixtureId: bundle.reviewer.id,
    draftScope: bundle.reviewer.draftScope,
    packetVersion: bundle.packet.version,
    itemDecisions,
    activeItem: bundle.packet.itemIds[0],
    updatedAt: '2026-07-09T12:00:00.000Z',
    editorId: 'tab_a',
    safeEvidenceConfirmed: false,
    ...overrides,
  };
}

export function installRuntimeGlobals(storage) {
  globalThis.localStorage = storage;
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
}
