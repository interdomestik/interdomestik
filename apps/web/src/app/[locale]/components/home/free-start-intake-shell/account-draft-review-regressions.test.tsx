import { StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftAccount, DraftEditorArgs } from './draft-lifecycle-editor';
import type { DraftState, SavedDraft } from './types';
import { useDraftLifecycle } from './use-draft-lifecycle';

const actions = vi.hoisted(() => ({
  account: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  resume: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@/actions/free-start-drafts', () => ({
  getFreeStartDraftAccount: actions.account,
  createFreeStartDraft: actions.create,
  listFreeStartDrafts: actions.list,
  resumeFreeStartDraft: actions.resume,
  updateFreeStartDraft: actions.update,
  deleteFreeStartDraft: actions.remove,
}));
const account: DraftAccount = {
  emailVerified: true,
  expectedContext: { ownerUserId: 'owner-a', tenantId: 'tenant_ks' },
};
const other: DraftAccount = {
  ...account,
  expectedContext: { ...account.expectedContext, ownerUserId: 'owner-b' },
};
const blank: DraftState = {
  counterparty: '',
  desiredOutcome: '',
  incidentDate: '',
  issueType: '',
  summary: '',
};
const facts: DraftState = { ...blank, issueType: 'collision', summary: 'Supported vehicle facts.' };
const saved: SavedDraft = {
  ...facts,
  category: 'vehicle',
  resumeStep: 'details',
  id: '22222222-2222-4222-8222-222222222222',
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  version: 1,
  createdAt: '2026-10-06T13:00:00.000Z',
  updatedAt: '2026-10-06T13:00:00.000Z',
};
function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(options: Partial<DraftEditorArgs> = {}, strict = false) {
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
beforeEach(() => {
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
  actions.update.mockImplementation(async input => ({
    ok: true,
    draft: { ...saved, ...input, version: input.expectedVersion + 1 },
  }));
  actions.remove.mockResolvedValue({ ok: true, id: saved.id });
});
describe('independent account continuity review counterexamples', () => {
  it('retains first-owner management when verified props precede OTP discovery', async () => {
    const discovery = held<unknown>();
    actions.account.mockResolvedValueOnce({ ok: false, code: 'authRequired' });
    actions.account.mockReturnValueOnce(discovery.promise);
    actions.list.mockResolvedValue({
      ok: true,
      items: [saved],
      nextCursor: null,
      expectedContext: account.expectedContext,
    });
    const hook = setup({ account: null, category: null, draft: blank, step: 'category' });
    await act(() => hook.result.current.openManage());
    let verifying!: Promise<void>;
    act(() => {
      verifying = hook.result.current.onVerified();
    });
    const rejected = expect(verifying).rejects.toThrow('secure_save_intent_failed');
    hook.rerender({ ...hook.props, account });
    await waitFor(() => expect(hook.result.current.items).toEqual([saved]));
    await act(async () => {
      discovery.resolve({ ok: true, ...account });
      await rejected;
    });
    expect(actions.resume).not.toHaveBeenCalled();
    expect(hook.onResume).not.toHaveBeenCalled();
    expect(hook.result.current).toMatchObject({ intent: 'manage', active: null, items: [saved] });
    expect(hook.onReset).not.toHaveBeenCalled();
    hook.rerender({ ...hook.props, account: other });
    expect(hook.result.current).toMatchObject({ intent: null, active: null, items: [] });
    expect(hook.onReset).toHaveBeenCalledOnce();
    hook.unmount();
  });
  it('persists clearing the last optional fact on the same draft', async () => {
    const hook = setup({ draft: { ...blank, counterparty: 'Insurer' } });
    await waitFor(() => expect(hook.result.current.state).toBe('saved'));
    hook.rerender({ ...hook.props, draft: blank });
    await waitFor(() => expect(actions.update).toHaveBeenCalledOnce());
    expect(actions.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: saved.id, expectedVersion: 1, summary: '', counterparty: '' })
    );
    expect(actions.create).toHaveBeenCalledOnce();
    await waitFor(() => expect(hook.result.current.state).toBe('saved'));
  });
  it('queues an intentional blank edit after a dispatched first create without another create', async () => {
    const create = held<unknown>();
    actions.create.mockReturnValueOnce(create.promise);
    const hook = setup({ draft: { ...blank, counterparty: 'Insurer' } });
    await waitFor(() => expect(actions.create).toHaveBeenCalledOnce());
    hook.rerender({ ...hook.props, draft: blank });
    await act(async () => {
      create.resolve({ ok: true, draft: saved });
      await create.promise;
    });
    await waitFor(() => expect(actions.update).toHaveBeenCalledOnce());
    expect(actions.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: saved.id, expectedVersion: 1, summary: '', counterparty: '' })
    );
    expect(actions.create).toHaveBeenCalledOnce();
    expect(hook.result.current.state).toBe('saved');
  });
  it('initializes B once after a delayed A list without typing or another dependency change', async () => {
    const a = held<unknown>();
    const b = { ...saved, id: '33333333-3333-4333-8333-333333333333' };
    actions.list.mockImplementation(input =>
      input.expectedContext.ownerUserId === 'owner-a'
        ? a.promise
        : Promise.resolve({
            ok: true,
            items: [b],
            nextCursor: null,
            expectedContext: other.expectedContext,
          })
    );
    actions.resume.mockResolvedValue({
      ok: true,
      draft: b,
      expectedContext: other.expectedContext,
    });
    const hook = setup({ draft: blank });
    await waitFor(() => expect(actions.list).toHaveBeenCalledOnce());
    hook.rerender({ ...hook.props, account: other });
    await act(async () => {
      a.resolve({
        ok: true,
        items: [saved],
        nextCursor: null,
        expectedContext: account.expectedContext,
      });
      await a.promise;
    });
    await waitFor(() => expect(hook.onResume).toHaveBeenCalledWith(b));
    expect(
      actions.list.mock.calls.filter(([input]) => input.expectedContext.ownerUserId === 'owner-b')
    ).toHaveLength(1);
    expect(hook.result.current.active?.id).toBe(b.id);
    expect(actions.create).not.toHaveBeenCalled();
  });
});
