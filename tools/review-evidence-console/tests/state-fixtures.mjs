import { canonicalStringify } from '../public/src/state/canonical-json.mjs';

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

export async function withReceiptId(receipt) {
  const { receiptId: ignored, ...payload } = receipt;
  const bytes = new TextEncoder().encode(canonicalStringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
  return { ...receipt, receiptId: `rec_${hex.slice(0, 24)}` };
}
