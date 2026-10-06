import type { SavedDraft } from '../types';

export const account = {
  emailVerified: true,
  expectedContext: { ownerUserId: 'owner-a', tenantId: 'tenant_ks' },
};
export const saved: SavedDraft = {
  category: 'vehicle',
  resumeStep: 'preview',
  issueType: 'collision',
  incidentDate: '2026-10-05',
  counterparty: 'Insurer',
  desiredOutcome: 'repair',
  summary: 'Bounded vehicle facts.',
  id: '22222222-2222-4222-8222-222222222222',
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  version: 1,
  createdAt: '2026-10-06T13:00:00.000Z',
  updatedAt: '2026-10-06T13:00:00.000Z',
};

export function held<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
