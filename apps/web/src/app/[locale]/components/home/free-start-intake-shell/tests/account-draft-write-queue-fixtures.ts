import { vi } from 'vitest';
import {
  createAccountDraftWriteQueue,
  type DraftCreateRequest,
  type DraftUpdateRequest,
  type DraftWriteResult,
  type DraftWriteSnapshot,
} from '../account-draft-write-queue';
import type { DraftSaveState, SavedDraft } from '../types';
export const context = { ownerUserId: 'owner-a', tenantId: 'tenant_ks' };
export const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
export const saved: SavedDraft = {
  category: 'vehicle',
  clientRequestId: REQUEST_ID,
  counterparty: 'Insurer',
  createdAt: '2026-10-06T13:00:00.000Z',
  desiredOutcome: 'repair',
  id: '22222222-2222-4222-8222-222222222222',
  incidentDate: '2026-03-01',
  issueType: 'collision',
  resumeStep: 'details',
  summary: 'a',
  updatedAt: '2026-10-06T13:00:00.000Z',
  version: 1,
};

export const snap = (summary: string): DraftWriteSnapshot => ({
  fingerprint: summary,
  payload: { category: 'vehicle', resumeStep: 'details', summary },
});
export const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
export const fail = (code: string) => (): Promise<DraftWriteResult> =>
  Promise.resolve({ ok: false, code });
export const okCreate = (): Promise<DraftWriteResult> =>
  Promise.resolve({ ok: true, draft: saved });
export const okUpdate = (_call: number, payload: DraftUpdateRequest): Promise<DraftWriteResult> =>
  Promise.resolve({
    ok: true,
    draft: { ...saved, summary: payload.summary ?? '', version: payload.expectedVersion + 1 },
  });

export function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

type Handlers = {
  create?: (call: number) => Promise<DraftWriteResult>;
  update?: (call: number, payload: DraftUpdateRequest) => Promise<DraftWriteResult>;
};

export function setup(handlers: Handlers = {}, expectedContext = context) {
  let createCalls = 0;
  let updateCalls = 0;
  const states: DraftSaveState[] = [];
  const acks = vi.fn();
  const create = vi.fn((_payload: DraftCreateRequest) =>
    (handlers.create ?? okCreate)(++createCalls)
  );
  const update = vi.fn((payload: DraftUpdateRequest) =>
    (handlers.update ?? okUpdate)(++updateCalls, payload)
  );
  const queue = createAccountDraftWriteQueue({
    expectedContext,
    clientRequestId: REQUEST_ID,
    create,
    update,
    onState: state => states.push(state),
    onAck: acks,
  });
  return { queue, create, update, states, acks };
}
