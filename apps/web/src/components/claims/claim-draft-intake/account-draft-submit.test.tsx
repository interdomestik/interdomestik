import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftLifecycleCommands } from '@/app/[locale]/components/home/free-start-intake-shell/draft-lifecycle-commands';
import { DraftEditor } from '@/app/[locale]/components/home/free-start-intake-shell/draft-lifecycle-editor';
import {
  account,
  saved,
} from '@/app/[locale]/components/home/free-start-intake-shell/tests/terminal-draft-fixtures';
import type { DraftState } from '@/app/[locale]/components/home/free-start-intake-shell/types';
import { useSavedDraftClaim } from './use-saved-draft-claim';
const actions = vi.hoisted(() => ({
  submit: vi.fn(),
  lookup: vi.fn(),
  finish: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@/actions/claims/create-from-saved-draft', () => ({
  createClaimFromSavedDraft: actions.submit,
  lookupSavedDraftClaim: actions.lookup,
}));
vi.mock('@/lib/observability/critical-action', () => ({
  startCriticalAction: () => ({ finish: actions.finish }),
}));
vi.mock('@/actions/free-start-drafts', () => ({
  createFreeStartDraft: actions.create,
  deleteFreeStartDraft: actions.remove,
  getFreeStartDraftAccount: vi.fn(),
  listFreeStartDrafts: vi.fn(),
  resumeFreeStartDraft: vi.fn(),
  updateFreeStartDraft: actions.update,
}));
const id = '22222222-2222-4222-8222-222222222222';
const options = {
  draftId: id,
  draftVersion: 1,
  eligible: true,
  failedCopy: 'Failed',
  unexpectedCopy: 'Unexpected',
};
beforeEach(() => {
  vi.resetAllMocks();
  actions.lookup.mockResolvedValue({ claim: null });
  actions.submit.mockResolvedValue({ success: false });
});
function mountRealEditor() {
  const { issueType, incidentDate, counterparty, desiredOutcome, summary } = saved;
  const facts: DraftState = { issueType, incidentDate, counterparty, desiredOutcome, summary };
  const state = { account, draft: facts };
  const editor = new DraftEditor(
    () => ({
      account: state.account,
      category: 'vehicle',
      step: 'preview',
      draft: state.draft,
      onReset: vi.fn(),
      onResume: vi.fn(),
    }),
    vi.fn()
  );
  editor.initialized = true;
  editor.patch({ active: saved, state: 'saved' });
  editor.savedFingerprint = editor.fingerprint();
  editor.getQueue();
  const commands = new DraftLifecycleCommands(editor);
  const hook = renderHook(() =>
    useSavedDraftClaim({
      ...options,
      prepareForContinuation: () => commands.prepareForContinuation(),
      onContinuationRejected: receipt => commands.releaseContinuation(receipt),
    })
  );
  return { commands, editor, hook, state };
}
describe('explicit Submit after account autosave', () => {
  it('waits for the latest acknowledged version and prevents a second submission while draining', async () => {
    let finish!: (value: { id: string; version: number }) => void;
    const prepare = vi.fn(
      () =>
        new Promise<{ id: string; version: number }>(done => {
          finish = done;
        })
    );
    const release = vi.fn();
    const hook = renderHook(() =>
      useSavedDraftClaim({
        ...options,
        prepareForContinuation: prepare,
        onContinuationRejected: release,
      })
    );
    await waitFor(() => expect(hook.result.current.lookupStatus).toBe('not_found'));
    act(() => {
      hook.result.current.submit();
      hook.result.current.submit();
    });
    expect(prepare).toHaveBeenCalledOnce();
    expect(actions.submit).not.toHaveBeenCalled();
    await act(async () => {
      finish({ id, version: 2 });
    });
    expect(actions.submit).toHaveBeenCalledExactlyOnceWith({ id, expectedVersion: 2 });
    expect(release).toHaveBeenCalledOnce();
  });
  it('does not submit stale facts when current editor ownership or saving cannot settle', async () => {
    const release = vi.fn();
    const hook = renderHook(() =>
      useSavedDraftClaim({
        ...options,
        prepareForContinuation: async () => null,
        onContinuationRejected: release,
      })
    );
    await waitFor(() => expect(hook.result.current.lookupStatus).toBe('not_found'));
    await act(async () => hook.result.current.submit());
    expect(actions.submit).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
    expect(hook.result.current.failure).toBe('Failed');
  });
  it('retains the separate membership eligibility gate before any draining or Submit', async () => {
    const prepare = vi.fn();
    const hook = renderHook(() =>
      useSavedDraftClaim({ ...options, eligible: false, prepareForContinuation: prepare })
    );
    await act(async () => hook.result.current.submit());
    expect(prepare).not.toHaveBeenCalled();
    expect(actions.submit).not.toHaveBeenCalled();
  });
  it('releases only its own lease after Submit success for same-draft edits', async () => {
    const claim = { id: 'claim-1', number: 'CLM-1' };
    actions.submit.mockResolvedValueOnce({
      success: true,
      claimId: claim.id,
      claimNumber: claim.number,
    });
    actions.update.mockImplementation(
      async (input: { expectedVersion: number; summary: string }) => ({
        ok: true,
        draft: { ...saved, summary: input.summary, version: input.expectedVersion + 1 },
      })
    );
    const { editor, hook, state } = mountRealEditor();
    await waitFor(() => expect(hook.result.current.lookupStatus).toBe('not_found'));
    act(() => hook.result.current.submit());
    await waitFor(() => expect(hook.result.current.claim).toEqual(claim));
    expect(hook.result.current.origin).toBe('user_submit');
    expect(actions.submit).toHaveBeenCalledExactlyOnceWith({ id, expectedVersion: 1 });
    expect(actions.finish).toHaveBeenCalledExactlyOnceWith('success');
    expect(editor.terminal).toBe(false);
    for (const [summary, expectedVersion] of [
      ['Edited after Submit.', 1],
      ['Edited again.', 2],
    ] as const) {
      state.draft = { ...state.draft, summary };
      editor.autoSave();
      expect(actions.update).toHaveBeenLastCalledWith({
        category: 'vehicle',
        counterparty: saved.counterparty,
        desiredOutcome: saved.desiredOutcome,
        incidentDate: saved.incidentDate,
        issueType: saved.issueType,
        resumeStep: 'preview',
        summary,
        id,
        expectedVersion,
        expectedContext: account.expectedContext,
      });
      await waitFor(() => expect(editor.view.active?.version).toBe(expectedVersion + 1));
    }
    act(() => hook.result.current.submit());
    expect(actions.submit).toHaveBeenCalledOnce();
    expect(hook.result.current.claim).toEqual(claim);
    expect(actions.create).not.toHaveBeenCalled();
    expect(actions.remove).not.toHaveBeenCalled();
  });
  it.each(['dispose', 'owner change'])(
    'keeps a late successful Submit from releasing a lease after %s',
    async kind => {
      let respond!: (value: unknown) => void;
      actions.submit.mockReturnValueOnce(
        new Promise(done => {
          respond = done;
        })
      );
      const { commands, editor, hook, state } = mountRealEditor();
      await waitFor(() => expect(hook.result.current.lookupStatus).toBe('not_found'));
      act(() => hook.result.current.submit());
      await waitFor(() =>
        expect(actions.submit).toHaveBeenCalledExactlyOnceWith({ id, expectedVersion: 1 })
      );
      expect(editor.terminal).toBe(true);
      if (kind === 'dispose') commands.dispose();
      else {
        state.account = {
          emailVerified: true,
          expectedContext: { ownerUserId: 'owner-b', tenantId: 'tenant_ks' },
        };
        expect(editor.syncAccount()).toBe(true);
      }
      const held = editor.terminal;
      respond({ success: true, claimId: 'claim-1', claimNumber: 'CLM-1' });
      await waitFor(() =>
        expect(hook.result.current.claim).toEqual({ id: 'claim-1', number: 'CLM-1' })
      );
      expect(actions.finish).toHaveBeenCalledExactlyOnceWith('success');
      expect(editor.terminal).toBe(held);
      state.draft = { ...state.draft, summary: 'Late edit.' };
      editor.autoSave();
      expect(actions.update).not.toHaveBeenCalled();
      expect(actions.create).not.toHaveBeenCalled();
    }
  );
});
