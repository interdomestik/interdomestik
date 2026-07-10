export function makeStorage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

export const receiptInput = {
  schemaVersion: 1,
  packetId: 'mob-03a-part-a',
  packetVersion: '1',
  assignmentId: 'assign_a',
  reviewerFixtureId: 'reviewer_a',
  reviewerDisplayName: 'Privacy reviewer',
  reviewerRole: 'privacy',
  packetRole: 'privacy',
  authorityDisclaimer: 'Fixture authority only; no production decision.',
  decisions: {
    item_a: { decision: 'approve', severity: 'high', riskCategory: 'privacy' },
  },
  structuredResponses: { item_a: { ownerRole: 'Privacy lead' } },
};

export const submittedAt = '2026-07-09T12:00:00.000Z';
