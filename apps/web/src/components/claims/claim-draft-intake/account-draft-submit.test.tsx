import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSavedDraftClaim } from './use-saved-draft-claim';
const actions = vi.hoisted(() => ({ submit: vi.fn(), lookup: vi.fn(), finish: vi.fn() }));
vi.mock('@/actions/claims/create-from-saved-draft', () => ({
  createClaimFromSavedDraft: actions.submit,
  lookupSavedDraftClaim: actions.lookup,
}));
vi.mock('@/lib/observability/critical-action', () => ({
  startCriticalAction: () => ({ finish: actions.finish }),
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
});
