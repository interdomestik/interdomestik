import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedDraft } from './types';
import {
  account,
  other,
  blank,
  facts,
  saved,
  held,
  setup,
  resetActions,
} from './tests/account-draft-ownership-fixtures';

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
beforeEach(() => resetActions(actions));
describe('account-bound draft ownership and terminal behavior', () => {
  it('does not create a blank draft from category selection alone', async () => {
    const hook = setup({ draft: blank });
    await waitFor(() => expect(actions.list).toHaveBeenCalledOnce());
    await act(async () => {});
    expect(actions.create).not.toHaveBeenCalled();
    expect(hook.result.current.active).toBeNull();
  });
  it('restores a sole account draft only into a blank editor', async () => {
    actions.list.mockResolvedValue({
      ok: true,
      items: [saved],
      nextCursor: null,
      expectedContext: account.expectedContext,
    });
    const hook = setup({ draft: blank });
    await waitFor(() => expect(hook.onResume).toHaveBeenCalledWith(saved));
    expect(actions.resume).toHaveBeenCalledWith({
      id: saved.id,
      expectedContext: account.expectedContext,
    });
    expect(actions.create).not.toHaveBeenCalled();
  });
  it('requires explicit selection when multiple saved drafts exist', async () => {
    actions.list.mockResolvedValue({
      ok: true,
      items: [saved, { ...saved, id: '33333333-3333-4333-8333-333333333333' }],
      nextCursor: null,
      expectedContext: account.expectedContext,
    });
    const hook = setup({ draft: blank });
    await waitFor(() => expect(hook.result.current.items).toHaveLength(2));
    expect(actions.resume).not.toHaveBeenCalled();
    expect(actions.create).not.toHaveBeenCalled();
    await act(() => hook.result.current.resume(saved.id));
    expect(hook.onResume).toHaveBeenCalledWith(saved);
  });
  it('does not adopt anonymous facts merely because account discovery becomes verified', async () => {
    const hook = setup({ account: null });
    hook.rerender({ ...hook.props, account });
    await waitFor(() => expect(actions.list).toHaveBeenCalledOnce());
    expect(actions.create).not.toHaveBeenCalled();
    expect(hook.onReset).not.toHaveBeenCalled();
    await act(() => hook.result.current.openSave());
    expect(actions.create).toHaveBeenCalledOnce();
  });
  it('pins an unverified known owner and rejects verification into another account', async () => {
    const unverified = { ...account, emailVerified: false };
    const hook = setup({ account: unverified });
    actions.account.mockResolvedValueOnce({ ok: true, ...unverified });
    await act(() => hook.result.current.openSave());
    actions.account.mockResolvedValue({ ok: true, ...other });
    await act(async () => {
      await expect(hook.result.current.onVerified()).rejects.toThrow('secure_save_intent_failed');
    });
    expect(actions.create).not.toHaveBeenCalled();
    expect(hook.result.current.state).toBe('accountContext');
  });
  it('rejects a B server receipt while the A frontend token is unchanged', async () => {
    actions.list.mockResolvedValue({
      ok: true,
      items: [saved],
      nextCursor: null,
      expectedContext: other.expectedContext,
    });
    const hook = setup();
    await waitFor(() => expect(hook.result.current.state).toBe('accountContext'));
    expect(hook.result.current.items).toEqual([]);
    expect(actions.create).not.toHaveBeenCalled();
  });
  it('rejects a B resume receipt under the unchanged A editor', async () => {
    const hook = setup({ draft: blank });
    await waitFor(() => expect(actions.list).toHaveBeenCalledOnce());
    actions.resume.mockResolvedValue({
      ok: true,
      draft: saved,
      expectedContext: other.expectedContext,
    });
    await act(async () => {
      expect(await hook.result.current.resume(saved.id)).toBe(false);
    });
    expect(hook.onResume).not.toHaveBeenCalled();
    expect(hook.result.current.active).toBeNull();
  });
  it('does not show stale A list results after a same-facts account switch to B', async () => {
    const list = held<unknown>();
    actions.list.mockReturnValueOnce(list.promise);
    const hook = setup();
    await waitFor(() => expect(actions.list).toHaveBeenCalledOnce());
    hook.rerender({ ...hook.props, account: other });
    await act(async () => {
      list.resolve({
        ok: true,
        items: [saved],
        nextCursor: null,
        expectedContext: account.expectedContext,
      });
      await list.promise;
    });
    expect(hook.result.current.items).toEqual([]);
    expect(hook.result.current.active).toBeNull();
    expect(actions.create).not.toHaveBeenCalled();
    expect(hook.onReset).toHaveBeenCalledOnce();
  });
  it.each([
    { category: 'injury' as const, draft: facts, state: 'unsupported' },
    {
      category: 'vehicle' as const,
      draft: { ...facts, summary: 'Hospital diagnosis.' },
      state: 'invalid',
    },
  ])('never marks the current $state edit saved after a late valid acknowledgment', async next => {
    const create = held<unknown>();
    actions.create.mockReturnValueOnce(create.promise);
    const hook = setup();
    await waitFor(() => expect(actions.create).toHaveBeenCalledOnce());
    hook.rerender({ ...hook.props, category: next.category, draft: next.draft });
    await act(async () => {
      create.resolve({ ok: true, draft: saved });
      await create.promise;
    });
    expect(hook.result.current.state).toBe(next.state);
    expect(hook.result.current.hasUnsavedChanges).toBe(true);
    expect(actions.update).not.toHaveBeenCalled();
  });
  it('deletes the settled latest version after a pending update without recreation', async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.state).toBe('saved'));
    const update = held<unknown>();
    actions.update.mockReturnValueOnce(update.promise);
    hook.rerender({ ...hook.props, draft: { ...facts, summary: 'Newer facts.' } });
    await waitFor(() => expect(actions.update).toHaveBeenCalledOnce());
    let removing!: Promise<unknown>;
    act(() => {
      removing = hook.result.current.remove(saved);
    });
    expect(actions.remove).not.toHaveBeenCalled();
    await act(async () => {
      update.resolve({ ok: true, draft: { ...saved, version: 2 } });
      await removing;
    });
    expect(actions.remove).toHaveBeenCalledWith({ id: saved.id, expectedVersion: 2 });
    expect(hook.result.current.active).toBeNull();
    expect(actions.create).toHaveBeenCalledOnce();
  });
  it('returns the settled latest acknowledgment for explicit continuation', async () => {
    const hook = setup();
    await waitFor(() => expect(hook.result.current.state).toBe('saved'));
    const update = held<unknown>();
    actions.update.mockReturnValueOnce(update.promise);
    const changed = { ...facts, summary: 'Newer facts.' };
    hook.rerender({ ...hook.props, draft: changed });
    await waitFor(() => expect(actions.update).toHaveBeenCalledOnce());
    let continuing!: Promise<SavedDraft | null>;
    act(() => {
      continuing = hook.result.current.prepareForContinuation();
    });
    const latest = { ...saved, ...changed, version: 2 };
    await act(async () => {
      update.resolve({ ok: true, draft: latest });
      expect(await continuing).toEqual(latest);
    });
    expect(actions.create).toHaveBeenCalledOnce();
  });
  it('drains a deferred create plus newer facts before any continuation', async () => {
    const create = held<unknown>(),
      update = held<unknown>();
    actions.create.mockReturnValueOnce(create.promise);
    actions.update.mockReturnValueOnce(update.promise);
    const hook = setup();
    await waitFor(() => expect(actions.create).toHaveBeenCalledOnce());
    const changed = { ...facts, summary: 'Newer continuation facts.' };
    hook.rerender({ ...hook.props, draft: changed });
    let continuation!: Promise<SavedDraft | null>;
    const accepted = vi.fn();
    act(() => {
      continuation = hook.result.current.prepareForContinuation();
      void continuation.then(accepted);
    });
    await act(async () => {
      create.resolve({ ok: true, draft: saved });
      await create.promise;
    });
    await waitFor(() => expect(actions.update).toHaveBeenCalledOnce());
    expect(accepted).not.toHaveBeenCalled();
    expect(actions.update).toHaveBeenCalledWith(
      expect.objectContaining({ summary: changed.summary, expectedVersion: 1 })
    );
    const latest = { ...saved, ...changed, version: 2 };
    await act(async () => {
      update.resolve({ ok: true, draft: latest });
      expect(await continuation).toEqual(latest);
    });
    expect(accepted).toHaveBeenCalledWith(latest);
  });
  it('supports React StrictMode setup cleanup without a duplicate create', async () => {
    const hook = setup({}, true);
    await waitFor(() => expect(hook.result.current.state).toBe('saved'));
    expect(actions.create).toHaveBeenCalledOnce();
  });
});
