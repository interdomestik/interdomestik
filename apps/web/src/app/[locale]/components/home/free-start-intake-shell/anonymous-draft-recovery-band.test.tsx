import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import en from '@/messages/en/freeStart.json';
import { AnonymousDraftRecoveryBand } from './anonymous-draft-recovery-band';
// prettier-ignore
import { ANONYMOUS_DRAFT_KEY, ANONYMOUS_DRAFT_TTL_MS, readAnonymousDraft, writeAnonymousDraft, type AnonymousDraftSnapshot } from './anonymous-draft-recovery';
import { useAnonymousDraftRecovery } from './use-anonymous-draft-recovery';
// prettier-ignore
vi.mock('next-intl', () => ({ useTranslations: () => ({ raw: () => en.freeStart.secureSave }) }));
// prettier-ignore
function recovery(state: 'discarded' | 'offer' | 'saved' | 'secure' | 'unavailable') { return { clearDeviceCopy: vi.fn(), discard: vi.fn(), offer: state === 'offer' ? { category: 'property', draft: {}, expiresAt: '2026-08-27T12:00:00.000Z', resumeStep: 'preview', updatedAt: '2026-07-28T12:00:00.000Z' } : null, resume: vi.fn(), state }; }

// prettier-ignore
const snapshot: AnonymousDraftSnapshot = { category: 'property', draft: { counterparty: 'Insurer', desiredOutcome: 'repair', incidentDate: '2026-07-15', issueType: 'water_damage', summary: 'Water damaged two rooms.' }, resumeStep: 'preview' };
type HookProps = Parameters<typeof useAnonymousDraftRecovery>[0];
function setupRecovery(lifecycleState: 'idle' | 'loading' | 'saved' | 'saving' = 'idle') {
  const calls: string[] = [],
    onReset = vi.fn(() => calls.push('reset'));
  const onRestore = vi.fn(() => calls.push('restore'));
  // prettier-ignore
  const props: HookProps = { activeId: null, category: null, draft: snapshot.draft, lifecycleState, neutralHost: globalThis.location.host, onReset, onRestore, resetCategory: null, step: 'details' };
  const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props });
  return { ...hook, calls, onReset, onRestore, props };
}
// prettier-ignore
function clearEvent(storageArea: Storage) { const event = new StorageEvent('storage', { key: null }); Object.defineProperty(event, 'storageArea', { value: storageArea }); return event; }
// prettier-ignore
beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn(async (_name, _options, callback) => callback()) } }); });

describe('AnonymousDraftRecoveryBand', () => {
  // prettier-ignore
  it('offers explicit keyboard-reachable resume and discard actions', () => { const value = recovery('offer'); render(<AnonymousDraftRecoveryBand recovery={value as never} />); expect(screen.getByTestId('anonymous-draft-recovery-offer')).toHaveAccessibleName('Continue notes from this browser?'); const resume = screen.getByRole('button', { name: 'Continue with these notes' }); const discard = screen.getByRole('button', { name: 'Discard from this device' }); expect(resume).toHaveClass('min-h-11'); expect(discard).toHaveClass('min-h-11'); fireEvent.click(resume); fireEvent.click(discard); expect(value.resume).toHaveBeenCalledOnce(); expect(value.discard).toHaveBeenCalledOnce(); });
  // prettier-ignore
  it('states the same-browser boundary after a successful local write', () => { render(<AnonymousDraftRecoveryBand recovery={recovery('saved') as never} />); const region = screen.getByTestId('anonymous-draft-recovery-status'); expect(region).toHaveTextContent('only in this browser'); expect(region).toHaveTextContent('not secure save'); expect(region).toHaveTextContent('30 days'); expect(region).toHaveTextContent('private device'); });
  // prettier-ignore
  it.each(['unavailable', 'discarded', 'secure'] as const)('does not claim that a browser copy is saved after the %s terminal state', state => { render(<AnonymousDraftRecoveryBand recovery={recovery(state) as never} />); const region = screen.getByTestId('anonymous-draft-recovery-status'); expect(region).not.toHaveTextContent('Saved on this browser'); expect(region).not.toHaveTextContent('can recover here for 30 days'); expect(region).not.toHaveTextContent('saved automatically only in this browser'); });
});

describe('anonymous recovery race contracts', () => {
  it('treats localStorage.clear as invalidation and revalidates a changed offer on resume', async () => {
    writeAnonymousDraft(localStorage, snapshot, null);
    const hook = setupRecovery();
    await waitFor(() => expect(hook.result.current.state).toBe('offer'));
    act(() => globalThis.dispatchEvent(clearEvent(sessionStorage)));
    expect(hook.result.current.state).toBe('offer');
    localStorage.clear();
    act(() => globalThis.dispatchEvent(clearEvent(localStorage)));
    await waitFor(() => expect(hook.result.current.state).toBe('discarded'));
    const current = writeAnonymousDraft(localStorage, snapshot, null);
    hook.unmount();
    const changed = setupRecovery();
    await waitFor(() => expect(changed.result.current.state).toBe('offer'));
    // prettier-ignore
    writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, summary: 'Newer tab copy.' } }, current.status === 'saved' ? current.record : null, Date.now() + 10);
    act(() => changed.result.current.resume());
    await waitFor(() =>
      expect(changed.result.current.offer?.draft.summary).toBe('Newer tab copy.')
    );
    expect(changed.onRestore).not.toHaveBeenCalled();
  });

  // prettier-ignore
  it.each(['expired', 'denied'] as const)('does not restore an offer that became %s', async mode => { const now = Date.now(), clock = vi.spyOn(Date, 'now').mockReturnValue(now); writeAnonymousDraft(localStorage, snapshot, null, now); const hook = setupRecovery(); await waitFor(() => expect(hook.result.current.state).toBe('offer')); if (mode === 'expired') clock.mockReturnValue(now + ANONYMOUS_DRAFT_TTL_MS + 1); else vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('blocked'); }); act(() => hook.result.current.resume()); await waitFor(() => expect(hook.result.current.state).toBe(mode === 'expired' ? 'discarded' : 'unavailable')); expect(hook.onRestore).not.toHaveBeenCalled(); });

  it('retains a newer browser revision across secure promotion', async () => {
    writeAnonymousDraft(localStorage, snapshot, null);
    const hook = setupRecovery();
    await waitFor(() => expect(hook.result.current.state).toBe('offer'));
    act(() => hook.result.current.resume());
    await waitFor(() => expect(hook.onRestore).toHaveBeenCalled());
    const restored = { ...hook.props, category: 'property' as const, step: 'preview' as const };
    hook.rerender(restored);
    hook.rerender({ ...restored, activeId: 'server', lifecycleState: 'saving' });
    const current = readAnonymousDraft(localStorage);
    if (current.status !== 'available') throw new Error('missing recovery record');
    // prettier-ignore
    writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, summary: 'Edit during save.' } }, current.record, Date.now() + 10);
    hook.rerender({ ...restored, activeId: 'server', lifecycleState: 'saved' });
    await waitFor(() => expect(hook.result.current.state).toBe('conflict'));
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Edit during save.');
  });

  it('reports unavailable when exact-revision removal fails after secure promotion', async () => {
    writeAnonymousDraft(localStorage, snapshot, null);
    const hook = setupRecovery();
    await waitFor(() => expect(hook.result.current.state).toBe('offer'));
    act(() => hook.result.current.resume());
    await waitFor(() => expect(hook.onRestore).toHaveBeenCalled());
    const restored = { ...hook.props, category: 'property' as const, step: 'preview' as const };
    hook.rerender(restored);
    hook.rerender({ ...restored, activeId: 'server', lifecycleState: 'saving' });
    const available = localStorage;
    // prettier-ignore
    vi.spyOn(globalThis, 'localStorage', 'get').mockReturnValue({ getItem: available.getItem.bind(available), removeItem: () => { throw new DOMException('blocked'); }, setItem: available.setItem.bind(available) } as unknown as Storage);
    hook.rerender({ ...restored, activeId: 'server', lifecycleState: 'saved' });
    await waitFor(() => expect(hook.result.current.state).toBe('unavailable'));
    expect(available.getItem(ANONYMOUS_DRAFT_KEY)).not.toBeNull();
  });

  it('detaches before resume and blocks resume or discard while secure work is pending', async () => {
    writeAnonymousDraft(localStorage, snapshot, null);
    const hook = setupRecovery();
    await waitFor(() => expect(hook.result.current.state).toBe('offer'));
    act(() => hook.result.current.resume());
    await waitFor(() => expect(hook.calls).toEqual(['reset', 'restore']));
    hook.unmount();
    const pending = setupRecovery('saving');
    await waitFor(() => expect(pending.result.current.state).toBe('offer'));
    // prettier-ignore
    act(() => { pending.result.current.resume(); pending.result.current.discard(); });
    expect(pending.calls).toEqual([]);
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).not.toBeNull();
  });

  it('writes the first real edit after an already-identical preselected reset', async () => {
    // prettier-ignore
    const empty: AnonymousDraftSnapshot['draft'] = { counterparty: '', desiredOutcome: '', incidentDate: '', issueType: '', summary: '' };
    const hook = setupRecovery();
    hook.rerender({ ...hook.props, category: 'property', draft: empty, resetCategory: 'property' });
    await waitFor(() => expect(hook.result.current.state).toBe('saved'));
    localStorage.clear();
    act(() => globalThis.dispatchEvent(clearEvent(localStorage)));
    // prettier-ignore
    hook.rerender({ ...hook.props, category: 'property', draft: { ...empty, summary: 'Stale edit.' }, resetCategory: 'property' });
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull();
    await expect(hook.result.current.clearBeforeReset()).resolves.toBe(true);
    // prettier-ignore
    hook.rerender({ ...hook.props, category: 'property', draft: { ...empty, summary: 'First edit.' }, resetCategory: 'property' });
    await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('First edit.'));
  });

  // prettier-ignore
  it('retains the last valid record and retries only after a later valid correction', async () => { const hook = setupRecovery(); hook.rerender({ ...hook.props, category: 'property', draft: snapshot.draft }); await waitFor(() => expect(hook.result.current.state).toBe('saved')); const valid = localStorage.getItem(ANONYMOUS_DRAFT_KEY); hook.rerender({ ...hook.props, category: 'property', draft: { ...snapshot.draft, summary: 'Hospital treatment' } }); await waitFor(() => expect(hook.result.current.state).toBe('idle')); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBe(valid); hook.rerender({ ...hook.props, category: 'property', draft: { ...snapshot.draft, summary: 'Corrected property facts.' } }); await waitFor(() => expect(hook.result.current.state).toBe('saved')); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Corrected property facts.'); });

  // prettier-ignore
  it('recovers on a later interaction after temporary lock denial', async () => { const request = vi.fn().mockRejectedValueOnce(new Error('denied')).mockImplementation(async (_name, _options, callback) => callback()); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } }); const hook = setupRecovery(); await waitFor(() => expect(hook.result.current.state).toBe('unavailable')); hook.rerender({ ...hook.props, category: 'property', draft: { ...snapshot.draft, summary: 'Reconcile first.' } }); await waitFor(() => expect(hook.result.current.state).toBe('idle')); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull(); hook.rerender({ ...hook.props, category: 'property', draft: { ...snapshot.draft, summary: 'Retry succeeds.' } }); await waitFor(() => expect(hook.result.current.state).toBe('saved')); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Retry succeeds.'); expect(request).toHaveBeenCalledTimes(3); });

  // prettier-ignore
  it('reconciles a newer sibling copy after temporary denial before retrying', async () => { const seed = writeAnonymousDraft(localStorage, snapshot, null); if (seed.status !== 'saved') throw new Error('seed failed'); const hook = setupRecovery(); await waitFor(() => expect(hook.result.current.state).toBe('offer')); const request = vi.fn().mockRejectedValueOnce(new Error('denied')).mockImplementation(async (_name, _options, callback) => callback()); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } }); act(() => hook.result.current.resume()); await waitFor(() => expect(hook.result.current.state).toBe('unavailable')); writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, summary: 'Newer sibling copy.' } }, seed.record, Date.now() + 10); hook.rerender({ ...hook.props, category: 'property', draft: { ...snapshot.draft, summary: 'Denied candidate.' } }); await waitFor(() => expect(hook.result.current.offer?.draft.summary).toBe('Newer sibling copy.')); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).not.toContain('Denied candidate.'); act(() => hook.result.current.resume()); await waitFor(() => expect(hook.onRestore).toHaveBeenCalled()); hook.rerender({ ...hook.props, category: 'property', draft: { ...snapshot.draft, summary: 'Fresh retry.' } }); await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Fresh retry.')); });
});
