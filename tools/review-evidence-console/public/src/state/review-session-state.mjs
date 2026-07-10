const DECISION_FIELDS = new Set([
  'concreteAnswer',
  'reason',
  'evidenceRef',
  'verifiedAt',
  'riskCategory',
  'severity',
  'requestedChange',
]);

export const EMPTY_DECISION = Object.freeze({
  decision: null,
  concreteAnswer: '',
  reason: '',
  evidenceRef: '',
  verifiedAt: '',
  riskCategory: '',
  severity: '',
  requestedChange: '',
  responses: Object.freeze({}),
});

export function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

export function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function assertField(field) {
  if (!DECISION_FIELDS.has(field)) throw new TypeError('Unknown decision field.');
}

export function initialState(bundle, draft) {
  const { assignment, reviewer, packet } = bundle ?? {};
  if (
    !assignment ||
    !reviewer ||
    !packet ||
    assignment.packetId !== packet.id ||
    assignment.reviewerFixtureId !== reviewer.id ||
    assignment.reviewerRole !== reviewer.role ||
    reviewer.role !== packet.reviewerRole
  ) {
    throw new TypeError('Assignment, reviewer, and packet identities must match.');
  }
  const itemIds = packet.itemIds ?? [];
  const objectIds = packet.items?.map(item => item?.id) ?? [];
  if (
    !itemIds.length ||
    new Set(itemIds).size !== itemIds.length ||
    new Set(objectIds).size !== objectIds.length ||
    itemIds.some((id, index) => objectIds[index] !== id)
  ) {
    throw new TypeError('Packet item identities must match.');
  }
  const source = draft?.decisions ?? draft?.itemDecisions ?? {};
  if (Object.keys(source).some(id => !itemIds.includes(id))) {
    throw new TypeError('Draft contains an unknown item identity.');
  }
  const identities = {
    assignmentId: assignment.id,
    packetId: packet.id,
    packetVersion: packet.version,
    reviewerFixtureId: reviewer.id,
  };
  if (
    draft &&
    Object.entries(identities).some(([key, value]) => draft[key] && draft[key] !== value)
  ) {
    throw new TypeError('Draft identity does not match this assignment.');
  }
  const decisions = Object.fromEntries(
    itemIds.map(id => [
      id,
      {
        ...clone(EMPTY_DECISION),
        ...clone(source[id] ?? {}),
        responses: clone(source[id]?.responses ?? {}),
      },
    ])
  );
  const activeItem = itemIds.includes(draft?.activeItem) ? draft.activeItem : itemIds[0];
  return deepFreeze({
    ...identities,
    suggestionVersion: draft?.suggestionVersion,
    activeItem,
    decisions,
    correction: clone(draft?.correction ?? null),
  });
}
