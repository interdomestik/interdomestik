import { baseItem, completeDecision } from './validation-fixtures.mjs';

export const bundle = {
  assignment: { id: 'assign_a' },
  reviewer: { id: 'reviewer_a', displayName: 'Ada Reviewer', role: 'privacy' },
  packet: { id: 'packet_a', version: 'v1', reviewerRole: 'privacy', items: [baseItem] },
};

export const state = {
  decisions: { item: completeDecision({ responses: {} }) },
};

export function submissionDeps(events, overrides = {}) {
  const receipt = { receiptId: 'rec_1234567890abcdef12345678' };
  return {
    bundle,
    buildReceipt: async input => {
      events.push(['build', input]);
      return receipt;
    },
    receiptStore: {
      save: async value => {
        events.push(['store', value]);
        return { ok: true, value };
      },
    },
    directoryWriter: {
      requestDirectory: () => {
        events.push(['picker']);
        return Promise.resolve({ ok: true, value: {} });
      },
      save: async value => {
        events.push(['write', value]);
        return { ok: true, code: 'saved' };
      },
    },
    onInbox: () => events.push(['inbox']),
    onReceipt: id => events.push(['receipt', id]),
    ...overrides,
  };
}
