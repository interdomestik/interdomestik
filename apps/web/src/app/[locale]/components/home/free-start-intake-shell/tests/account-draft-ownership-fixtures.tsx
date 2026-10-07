import { StrictMode, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { vi, type Mock } from 'vitest';
import type { DraftAccount, DraftEditorArgs } from '../draft-lifecycle-editor';
import type { DraftState, SavedDraft } from '../types';
import { useDraftLifecycle } from '../use-draft-lifecycle';

export const account: DraftAccount = {
  emailVerified: true,
  expectedContext: { ownerUserId: 'owner-a', tenantId: 'tenant_ks' },
};
export const other: DraftAccount = {
  ...account,
  expectedContext: { ...account.expectedContext, ownerUserId: 'owner-b' },
};
export const blank: DraftState = {
  counterparty: '',
  desiredOutcome: '',
  incidentDate: '',
  issueType: '',
  summary: '',
};
export const facts: DraftState = {
  ...blank,
  issueType: 'collision',
  summary: 'Supported vehicle facts.',
};
export const saved: SavedDraft = {
  ...facts,
  category: 'vehicle',
  resumeStep: 'details',
  id: '22222222-2222-4222-8222-222222222222',
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  version: 1,
  createdAt: '2026-10-06T13:00:00.000Z',
  updatedAt: '2026-10-06T13:00:00.000Z',
};
export function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
export function setup(options: Partial<DraftEditorArgs> = {}, strict = false) {
  const onReset = vi.fn(),
    onResume = vi.fn();
  const props: DraftEditorArgs = {
    account,
    category: 'vehicle',
    draft: facts,
    step: 'details',
    onReset,
    onResume,
    ...options,
  };
  const wrapper = strict
    ? ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
    : undefined;
  return {
    ...renderHook(args => useDraftLifecycle(args), { initialProps: props, wrapper }),
    props,
    onReset,
    onResume,
  };
}

export function resetActions(
  actions: Record<'account' | 'list' | 'resume' | 'create' | 'update' | 'remove', Mock>
) {
  vi.resetAllMocks();
  actions.account.mockResolvedValue({ ok: true, ...account });
  actions.list.mockResolvedValue({
    ok: true,
    items: [],
    nextCursor: null,
    expectedContext: account.expectedContext,
  });
  actions.resume.mockResolvedValue({
    ok: true,
    draft: saved,
    expectedContext: account.expectedContext,
  });
  actions.create.mockResolvedValue({ ok: true, draft: saved });
  actions.update.mockImplementation(input =>
    Promise.resolve({
      ok: true,
      draft: { ...saved, ...input, version: input.expectedVersion + 1 },
    })
  );
  actions.remove.mockResolvedValue({ ok: true, id: saved.id });
}
