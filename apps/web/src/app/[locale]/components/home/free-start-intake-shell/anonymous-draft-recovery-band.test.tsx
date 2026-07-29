import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useLayoutEffect } from 'react';
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
type HeldRequest = Readonly<{
  grant: () => void;
  reject: (error: unknown) => void;
  settle: () => void;
}>;
function installHeldLocks(delayed = false) {
  const pending: HeldRequest[] = [],
    aborts: string[] = [];
  let calls = 0;
  // prettier-ignore
  const request = vi.fn((_name: string, options: { signal: AbortSignal }, callback: () => unknown) => { calls += 1; if (calls === 1) return Promise.resolve(callback()); return new Promise((resolve, reject) => { let granted = false, value: unknown; const settle = () => { if (granted) resolve(value); }, entry = { grant: () => { if (options.signal.aborted || granted) return; granted = true; try { value = callback(); if (!delayed) settle(); } catch (error) { reject(error); } }, reject, settle }; pending.push(entry); options.signal.addEventListener('abort', () => { aborts.push('AbortError'); if (!granted) reject(new DOMException('aborted', 'AbortError')); }, { once: true }); }); });
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
  return { aborts, pending, request };
}
// prettier-ignore
beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn(async (_name, _options, callback) => callback()) } }); });
describe('AnonymousDraftRecoveryBand', () => {
  // prettier-ignore
  it('offers explicit keyboard-reachable resume and discard actions', () => { const value = recovery('offer'); render(<AnonymousDraftRecoveryBand recovery={value as never} />); expect(screen.getByTestId('anonymous-draft-recovery-offer')).toHaveAccessibleName('Continue notes from this browser?'); const resume = screen.getByRole('button', { name: 'Continue with these notes' }); const discard = screen.getByRole('button', { name: 'Discard from this device' }); expect(resume).toHaveClass('min-h-11'); expect(discard).toHaveClass('min-h-11'); fireEvent.click(resume); fireEvent.click(discard); expect(value.resume).toHaveBeenCalledOnce(); expect(value.discard).toHaveBeenCalledOnce(); });
  // prettier-ignore
  it('states the same-browser boundary after a successful local write', () => { render(<AnonymousDraftRecoveryBand recovery={recovery('saved') as never} />); const region = screen.getByTestId('anonymous-draft-recovery-status'); expect(region).toHaveTextContent('only in this browser'); expect(region).toHaveTextContent('not secure save'); expect(region).toHaveTextContent('30 days'); expect(region).toHaveTextContent('private device'); });
  // prettier-ignore
  it.each(['unavailable', 'discarded', 'secure'] as const)('does not claim that a browser copy is saved after the %s terminal state', state => { render(<AnonymousDraftRecoveryBand recovery={recovery(state) as never} />); const region = screen.getByTestId('anonymous-draft-recovery-status'); expect(region).not.toHaveTextContent('Saved on this browser'); expect(region).not.toHaveTextContent('can recover here for 30 days'); expect(region).not.toHaveTextContent('saved automatically only in this browser'); });
  // prettier-ignore
  it('offers an explicit fresh epoch after a sibling discard', () => { const value = recovery('discarded'); render(<AnonymousDraftRecoveryBand recovery={value as never} />); fireEvent.click(screen.getByRole('button', { name: 'Start another draft' })); expect(value.discard).toHaveBeenCalledOnce(); });
});
describe('anonymous recovery race contracts', () => {
  // prettier-ignore
  it('treats localStorage.clear as invalidation and revalidates a changed offer on resume', async () => { writeAnonymousDraft(localStorage, snapshot, null); const hook = setupRecovery(); await waitFor(() => expect(hook.result.current.state).toBe('offer')); act(() => globalThis.dispatchEvent(clearEvent(sessionStorage))); expect(hook.result.current.state).toBe('offer'); localStorage.clear(); act(() => globalThis.dispatchEvent(clearEvent(localStorage))); await waitFor(() => expect(hook.result.current.state).toBe('discarded')); const current = writeAnonymousDraft(localStorage, snapshot, null); hook.unmount(); const changed = setupRecovery(); await waitFor(() => expect(changed.result.current.state).toBe('offer')); writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, summary: 'Newer tab copy.' } }, current.status === 'saved' ? current.record : null, Date.now() + 10); act(() => changed.result.current.resume()); await waitFor(() => expect(changed.result.current.offer?.draft.summary).toBe('Newer tab copy.')); expect(changed.onRestore).not.toHaveBeenCalled(); });
  // prettier-ignore
  it.each(['expired', 'denied'] as const)('does not restore an offer that became %s', async mode => { const now = Date.now(), clock = vi.spyOn(Date, 'now').mockReturnValue(now); writeAnonymousDraft(localStorage, snapshot, null, now); const hook = setupRecovery(); await waitFor(() => expect(hook.result.current.state).toBe('offer')); if (mode === 'expired') clock.mockReturnValue(now + ANONYMOUS_DRAFT_TTL_MS + 1); else vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('blocked'); }); act(() => hook.result.current.resume()); await waitFor(() => expect(hook.result.current.state).toBe(mode === 'expired' ? 'discarded' : 'unavailable')); expect(hook.onRestore).not.toHaveBeenCalled(); });

  // prettier-ignore
  it('retains a newer browser revision across secure promotion', async () => { writeAnonymousDraft(localStorage, snapshot, null); const hook = setupRecovery(); await waitFor(() => expect(hook.result.current.state).toBe('offer')); act(() => hook.result.current.resume()); await waitFor(() => expect(hook.onRestore).toHaveBeenCalled()); const restored = { ...hook.props, category: 'property' as const, step: 'preview' as const }; hook.rerender(restored); hook.rerender({ ...restored, activeId: 'server', lifecycleState: 'saving' }); const current = readAnonymousDraft(localStorage); if (current.status !== 'available') throw new Error('missing recovery record'); writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, summary: 'Edit during save.' } }, current.record, Date.now() + 10); hook.rerender({ ...restored, activeId: 'server', lifecycleState: 'saved' }); await waitFor(() => expect(hook.result.current.state).toBe('conflict')); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Edit during save.'); });
  // prettier-ignore
  it('keeps a retained same-page copy current until the next secure save', async () => { writeAnonymousDraft(localStorage, snapshot, null); const hook = setupRecovery(); await waitFor(() => expect(hook.result.current.state).toBe('offer')); act(() => hook.result.current.resume()); await waitFor(() => expect(hook.onRestore).toHaveBeenCalled()); const restored = { ...hook.props, category: 'property' as const, step: 'preview' as const }, during = { ...snapshot.draft, summary: 'Edit during save.' }, later = { ...snapshot.draft, summary: 'Later edit after save.' }; hook.rerender(restored); hook.rerender({ ...restored, activeId: 'server', lifecycleState: 'saving' }); hook.rerender({ ...restored, activeId: 'server', draft: during, lifecycleState: 'saving' }); hook.rerender({ ...restored, activeId: 'server', draft: during, lifecycleState: 'saved' }); await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Edit during save.')); await waitFor(() => expect(hook.result.current.state).toBe('saved')); hook.rerender({ ...restored, activeId: 'server', draft: later, lifecycleState: 'dirty' }); await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Later edit after save.')); hook.rerender({ ...restored, activeId: 'server', draft: later, lifecycleState: 'saving' }); hook.rerender({ ...restored, activeId: 'server', draft: later, lifecycleState: 'saved' }); await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull()); });
  // prettier-ignore
  it('withdraws the saved claim while a newer edit waits for the lock', async () => { const hook = setupRecovery(); const initial = { ...hook.props, category: 'property' as const }; hook.rerender(initial); await waitFor(() => expect(hook.result.current.state).toBe('saved')); let grant!: () => void; const request = vi.fn((_name, _options, callback) => new Promise(resolve => { grant = () => resolve(callback()); })); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } }); hook.rerender({ ...initial, draft: { ...snapshot.draft, summary: 'New edit waits.' } }); await waitFor(() => expect(request).toHaveBeenCalledOnce()); expect(hook.result.current.state).toBe('idle'); act(() => grant()); await waitFor(() => expect(hook.result.current.state).toBe('saved')); });
  // prettier-ignore
  it('binds every held-lock completion to the current mounted generation', async () => {
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    // prettier-ignore
    const first: HookProps = { activeId: null, category: 'property', draft: { ...snapshot.draft, summary: 'Queued stale facts.' }, lifecycleState: 'idle', neutralHost: globalThis.location.host, onReset: vi.fn(), onRestore: vi.fn(), resetCategory: null, step: 'details' };
    let locks = installHeldLocks(true);
    // prettier-ignore
    function Harness({ grantStale, value }: { grantStale?: boolean; value: HookProps }) { const recovery = useAnonymousDraftRecovery(value); useLayoutEffect(() => { if (grantStale) locks.pending[0]?.grant(); }, [grantStale]); return <output data-testid="held-state">{recovery.state}</output>; }
    const view = render(<Harness value={first} />);
    await waitFor(() => expect(locks.request).toHaveBeenCalledTimes(2));
    view.rerender(<Harness grantStale value={{ ...first, draft: { ...snapshot.draft, summary: 'Current facts.' } }} />);
    await waitFor(() => expect(locks.request).toHaveBeenCalledTimes(3));
    act(() => { locks.pending[1]?.grant(); locks.pending[1]?.settle(); });
    await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Current facts.'));
    await waitFor(() => expect(screen.getByTestId('held-state')).toHaveTextContent('saved'));
    act(() => locks.pending[0]?.settle()); await act(async () => Promise.resolve());
    await waitFor(() => expect(screen.getByTestId('held-state')).toHaveTextContent('saved'));
    expect(writes.mock.calls.some(([, value]) => String(value).includes('Queued stale facts.'))).toBe(false);
    view.unmount(); localStorage.clear(); locks = installHeldLocks();
    let hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: first });
    await waitFor(() => expect(locks.request).toHaveBeenCalledTimes(2));
    hook.rerender({ ...first, draft: { ...snapshot.draft, summary: 'Hospital treatment' } });
    act(() => locks.pending[0]?.grant());
    await waitFor(() => expect(hook.result.current.state).toBe('idle'));
    expect(locks.aborts).toContain('AbortError');
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull();
    hook.unmount(); locks = installHeldLocks();
    hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: first });
    await waitFor(() => expect(locks.request).toHaveBeenCalledTimes(2));
    let clearing!: Promise<boolean>; act(() => { clearing = hook.result.current.clearBeforeReset(); });
    await waitFor(() => expect(locks.request).toHaveBeenCalledTimes(3));
    act(() => locks.pending[1]?.grant()); await expect(clearing).resolves.toBe(true);
    act(() => locks.pending[0]?.grant()); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull();
    hook.unmount(); locks = installHeldLocks();
    hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: first });
    await waitFor(() => expect(locks.request).toHaveBeenCalledTimes(2));
    hook.unmount(); act(() => locks.pending[0]?.grant());
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull();
    locks = installHeldLocks(true); hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: first });
    await waitFor(() => expect(locks.request).toHaveBeenCalledTimes(2));
    act(() => locks.pending[0]?.grant()); const granted = localStorage.getItem(ANONYMOUS_DRAFT_KEY), calls = writes.mock.calls.length;
    hook.unmount(); act(() => locks.pending[0]?.settle()); await act(async () => Promise.resolve());
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBe(granted); expect(writes).toHaveBeenCalledTimes(calls);
    localStorage.clear(); locks = installHeldLocks(); hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: first });
    await waitFor(() => expect(locks.request).toHaveBeenCalledTimes(2));
    act(() => locks.pending[0]?.reject(new Error('denied')));
    await waitFor(() => expect(hook.result.current.state).toBe('unavailable'));
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull(); hook.unmount();
  });
  it('fails the held component lane closed at the five-second timeout', async () => {
    vi.useFakeTimers();
    const locks = installHeldLocks();
    // prettier-ignore
    const props: HookProps = { activeId: null, category: 'property', draft: snapshot.draft, lifecycleState: 'idle', neutralHost: globalThis.location.host, onReset: vi.fn(), onRestore: vi.fn(), resetCategory: null, step: 'details' };
    const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(locks.request).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_001);
    });
    expect(hook.result.current.state).toBe('unavailable');
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull();
    hook.unmount();
    vi.useRealTimers();
  });
  // prettier-ignore
  it('reports unavailable when exact-revision removal fails after secure promotion', async () => { writeAnonymousDraft(localStorage, snapshot, null); const hook = setupRecovery(); await waitFor(() => expect(hook.result.current.state).toBe('offer')); act(() => hook.result.current.resume()); await waitFor(() => expect(hook.onRestore).toHaveBeenCalled()); const restored = { ...hook.props, category: 'property' as const, step: 'preview' as const }; hook.rerender(restored); hook.rerender({ ...restored, activeId: 'server', lifecycleState: 'saving' }); const available = localStorage; vi.spyOn(globalThis, 'localStorage', 'get').mockReturnValue({ getItem: available.getItem.bind(available), removeItem: () => { throw new DOMException('blocked'); }, setItem: available.setItem.bind(available) } as unknown as Storage); hook.rerender({ ...restored, activeId: 'server', lifecycleState: 'saved' }); await waitFor(() => expect(hook.result.current.state).toBe('unavailable')); expect(available.getItem(ANONYMOUS_DRAFT_KEY)).not.toBeNull(); });
  // prettier-ignore
  it('detaches before resume and blocks resume or discard while secure work is pending', async () => { writeAnonymousDraft(localStorage, snapshot, null); const hook = setupRecovery(); await waitFor(() => expect(hook.result.current.state).toBe('offer')); act(() => hook.result.current.resume()); await waitFor(() => expect(hook.calls).toEqual(['reset', 'restore'])); hook.unmount(); const pending = setupRecovery('saving'); await waitFor(() => expect(pending.result.current.state).toBe('offer')); act(() => { pending.result.current.resume(); pending.result.current.discard(); }); expect(pending.calls).toEqual([]); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).not.toBeNull(); });
  // prettier-ignore
  it('writes the first real edit after an already-identical preselected reset', async () => { const empty: AnonymousDraftSnapshot['draft'] = { counterparty: '', desiredOutcome: '', incidentDate: '', issueType: '', summary: '' }; const hook = setupRecovery(); hook.rerender({ ...hook.props, category: 'property', draft: empty, resetCategory: 'property' }); await waitFor(() => expect(hook.result.current.state).toBe('saved')); localStorage.clear(); act(() => globalThis.dispatchEvent(clearEvent(localStorage))); hook.rerender({ ...hook.props, category: 'property', draft: { ...empty, summary: 'Stale edit.' }, resetCategory: 'property' }); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull(); await expect(hook.result.current.clearBeforeReset()).resolves.toBe(true); hook.rerender({ ...hook.props, category: 'property', draft: { ...empty, summary: 'First edit.' }, resetCategory: 'property' }); await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('First edit.')); });
  // prettier-ignore
  it('retains the last valid record and retries only after a later valid correction', async () => { const hook = setupRecovery(); hook.rerender({ ...hook.props, category: 'property', draft: snapshot.draft }); await waitFor(() => expect(hook.result.current.state).toBe('saved')); const valid = localStorage.getItem(ANONYMOUS_DRAFT_KEY); hook.rerender({ ...hook.props, category: 'property', draft: { ...snapshot.draft, summary: 'Hospital treatment' } }); await waitFor(() => expect(hook.result.current.state).toBe('idle')); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBe(valid); hook.rerender({ ...hook.props, category: 'property', draft: { ...snapshot.draft, summary: 'Corrected property facts.' } }); await waitFor(() => expect(hook.result.current.state).toBe('saved')); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Corrected property facts.'); });
  // prettier-ignore
  it('recovers on a later interaction after temporary lock denial', async () => { const request = vi.fn().mockRejectedValueOnce(new Error('denied')).mockImplementation(async (_name, _options, callback) => callback()); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } }); const hook = setupRecovery(); await waitFor(() => expect(hook.result.current.state).toBe('unavailable')); hook.rerender({ ...hook.props, category: 'property', draft: { ...snapshot.draft, summary: 'Reconcile first.' } }); await waitFor(() => expect(hook.result.current.state).toBe('idle')); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull(); hook.rerender({ ...hook.props, category: 'property', draft: { ...snapshot.draft, summary: 'Retry succeeds.' } }); await waitFor(() => expect(hook.result.current.state).toBe('saved')); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Retry succeeds.'); expect(request).toHaveBeenCalledTimes(3); });
  // prettier-ignore
  it('reconciles a newer sibling copy after temporary denial before retrying', async () => { const seed = writeAnonymousDraft(localStorage, snapshot, null); if (seed.status !== 'saved') throw new Error('seed failed'); const hook = setupRecovery(); await waitFor(() => expect(hook.result.current.state).toBe('offer')); const request = vi.fn().mockRejectedValueOnce(new Error('denied')).mockImplementation(async (_name, _options, callback) => callback()); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } }); act(() => hook.result.current.resume()); await waitFor(() => expect(hook.result.current.state).toBe('unavailable')); writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, summary: 'Newer sibling copy.' } }, seed.record, Date.now() + 10); hook.rerender({ ...hook.props, category: 'property', draft: { ...snapshot.draft, summary: 'Denied candidate.' } }); await waitFor(() => expect(hook.result.current.offer?.draft.summary).toBe('Newer sibling copy.')); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).not.toContain('Denied candidate.'); act(() => hook.result.current.resume()); await waitFor(() => expect(hook.onRestore).toHaveBeenCalled()); hook.rerender({ ...hook.props, category: 'property', draft: { ...snapshot.draft, summary: 'Fresh retry.' } }); await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Fresh retry.')); });
});
