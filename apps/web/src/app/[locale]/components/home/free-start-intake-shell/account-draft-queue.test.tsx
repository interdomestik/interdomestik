import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDraftLifecycle } from './use-draft-lifecycle';
import type { CategoryId, DraftState, SavedDraft } from './types';
const actions = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
  resume: vi.fn(),
}));
vi.mock('@/actions/free-start-drafts', () => ({
  createFreeStartDraft: actions.create,
  updateFreeStartDraft: actions.update,
  deleteFreeStartDraft: actions.remove,
  listFreeStartDrafts: actions.list,
  resumeFreeStartDraft: actions.resume,
}));
const account = {
  emailVerified: true,
  expectedContext: { ownerUserId: 'owner-a', tenantId: 'tenant_ks' },
};
const draft: DraftState = {
  counterparty: 'Insurer',
  desiredOutcome: 'repair',
  incidentDate: '2026-03-01',
  issueType: 'collision',
  summary: 'Supported vehicle facts.',
};
const saved: SavedDraft = {
  ...draft,
  category: 'vehicle',
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  id: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-10-06T13:00:00.000Z',
  updatedAt: '2026-10-06T13:00:00.000Z',
  resumeStep: 'details',
  version: 1,
};
function setup() {
  const onReset = vi.fn(),
    onResume = vi.fn();
  const initialProps = {
    category: 'vehicle' as CategoryId | null,
    draft,
    step: 'details' as const,
    account,
  };
  return {
    ...renderHook(args => useDraftLifecycle({ ...args, onReset, onResume }), { initialProps }),
    onReset,
    onResume,
  };
}
function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('verified account draft queue ownership', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    actions.list.mockResolvedValue({
      ok: true,
      items: [],
      nextCursor: null,
      expectedContext: account.expectedContext,
    });
    actions.create.mockResolvedValue({ ok: true, draft: saved, idempotent: false });
    actions.update.mockImplementation(async payload => ({
      ok: true,
      draft: { ...saved, ...payload, version: payload.expectedVersion + 1 },
    }));
  });
  it('automatically saves a verified unpaid account without a deliberate save opener', async () => {
    const hook = setup();
    await waitFor(() => expect(actions.create).toHaveBeenCalledOnce());
    expect(actions.create).toHaveBeenCalledWith(
      expect.objectContaining({ expectedContext: account.expectedContext, summary: draft.summary })
    );
    await waitFor(() => expect(hook.result.current.state).toBe('saved'));
  });
  it('carries acknowledged version while a newer edit remains queued and never appears saved early', async () => {
    const create = held<unknown>(),
      update = held<unknown>();
    actions.create.mockReturnValue(create.promise);
    actions.update.mockReturnValue(update.promise);
    const hook = setup();
    await waitFor(() => expect(actions.create).toHaveBeenCalledOnce());
    hook.rerender({
      category: 'vehicle',
      step: 'details',
      account,
      draft: { ...draft, summary: 'Newer facts.' },
    });
    await act(async () => {
      create.resolve({ ok: true, draft: saved });
      await create.promise;
    });
    await waitFor(() => expect(actions.update).toHaveBeenCalledOnce());
    expect(hook.result.current.state).not.toBe('saved');
    expect(actions.update).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 1, summary: 'Newer facts.' })
    );
    await act(async () => {
      update.resolve({ ok: true, draft: { ...saved, summary: 'Newer facts.', version: 2 } });
      await update.promise;
    });
    await waitFor(() => expect(hook.result.current.state).toBe('saved'));
  });
  it('never adopts an A acknowledgment after the active account becomes B', async () => {
    const create = held<unknown>();
    actions.create.mockReturnValue(create.promise);
    const hook = setup();
    await waitFor(() => expect(actions.create).toHaveBeenCalledOnce());
    const other = {
      ...account,
      expectedContext: { ...account.expectedContext, ownerUserId: 'owner-b' },
    };
    hook.rerender({ category: 'vehicle', step: 'details', account: other, draft });
    await act(async () => {
      create.resolve({ ok: true, draft: saved });
      await create.promise;
    });
    expect(hook.result.current.active).toBeNull();
    expect(hook.result.current.state).not.toBe('saved');
    expect(hook.onReset).toHaveBeenCalledOnce();
    expect(actions.create).toHaveBeenCalledOnce();
  });
  it('drains a dispatched create before retiring the editor, without recreating its request', async () => {
    const create = held<unknown>();
    actions.create.mockReturnValue(create.promise);
    const hook = setup();
    await waitFor(() => expect(actions.create).toHaveBeenCalledOnce());
    act(() => {
      void hook.result.current.startAnother();
    });
    expect(hook.onReset).not.toHaveBeenCalled();
    await act(async () => {
      create.resolve({ ok: true, draft: saved });
      await create.promise;
    });
    await waitFor(() => expect(hook.onReset).toHaveBeenCalledOnce());
    expect(hook.result.current.active).toBeNull();
    expect(actions.create).toHaveBeenCalledOnce();
  });
  it('shows a CAS conflict and stops automatic retries while preserving the newer editor', async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.state).toBe('saved'));
    actions.update.mockResolvedValue({ ok: false, code: 'conflict', latestVersion: 2 });
    hook.rerender({
      category: 'vehicle',
      step: 'details',
      account,
      draft: { ...draft, summary: 'Newer facts.' },
    });
    await waitFor(() => expect(hook.result.current.state).toBe('conflict'));
    expect(actions.update).toHaveBeenCalledOnce();
    expect(hook.result.current.hasUnsavedChanges).toBe(true);
  });
});
