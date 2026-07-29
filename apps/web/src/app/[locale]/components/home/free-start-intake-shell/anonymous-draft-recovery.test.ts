import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaimDraftIntake } from '@/components/claims/claim-draft-intake';

// prettier-ignore
import { ANONYMOUS_DRAFT_KEY, ANONYMOUS_DRAFT_LOCK_NAME, ANONYMOUS_DRAFT_TTL_MS, createAnonymousDraftSnapshot, getAnonymousDraftStorage, readAnonymousDraft, removeAnonymousDraft, runAnonymousDraftLocked, writeAnonymousDraft, type AnonymousDraftSnapshot } from './anonymous-draft-recovery';
import { resetAfterRecoveryClear } from './index';
import { useAnonymousDraftRecovery } from './use-anonymous-draft-recovery';

// prettier-ignore
vi.mock('next-intl', async () => { const [{ default: claims }, { default: diaspora }, { default: freeStart }, helper] = await Promise.all([import('@/messages/en/claims.json'), import('@/messages/en/diaspora.json'), import('@/messages/en/freeStart.json'), import('@/test/next-intl-mock')]); return { NextIntlClientProvider: ({ children }: { children: ReactNode }) => children, useLocale: () => 'en', useTranslations: helper.createUseTranslationsMock(() => ({ claims: claims.claims, diaspora: diaspora.diaspora, freeStart: freeStart.freeStart })) }; });
// prettier-ignore
vi.mock('@/i18n/routing', () => ({ Link: ({ children }: { children: ReactNode }) => children }));
// prettier-ignore
const actions = vi.hoisted(() => ({ create: vi.fn(), delete: vi.fn(), list: vi.fn(), resume: vi.fn(), update: vi.fn() }));
// prettier-ignore
vi.mock('@/actions/free-start-drafts', () => ({ createFreeStartDraft: actions.create, deleteFreeStartDraft: actions.delete, listFreeStartDrafts: actions.list, resumeFreeStartDraft: actions.resume, updateFreeStartDraft: actions.update }));

const NOW = Date.parse('2026-07-28T12:00:00.000Z');
// prettier-ignore
const snapshot: AnonymousDraftSnapshot = { category: 'property', draft: { counterparty: 'Northwind Insurance', desiredOutcome: 'repair', incidentDate: '2026-07-15', issueType: 'water_damage', summary: 'Water damaged two rooms.' }, resumeStep: 'preview' };
type HookProps = Parameters<typeof useAnonymousDraftRecovery>[0];
// prettier-ignore
function installLocks(request = vi.fn(async (_name, _options, callback) => callback())) { Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } }); return request; }

// prettier-ignore
function rawRecord(recordPatch: Record<string, unknown> = {}, draftPatch: Record<string, unknown> = {}) { writeAnonymousDraft(localStorage, snapshot, null, NOW); const record = JSON.parse(localStorage.getItem(ANONYMOUS_DRAFT_KEY)!); return JSON.stringify({ ...record, ...recordPatch, draft: { ...record.draft, ...draftPatch } }); }
// prettier-ignore
const invalidRecords = [['malformed', '{'], ['unknown version', rawRecord({ version: 2 })], ['expired', rawRecord({ expiresAt: new Date(NOW - 1).toISOString() })], ['extended TTL', rawRecord({ expiresAt: new Date(NOW + ANONYMOUS_DRAFT_TTL_MS + 1).toISOString() })], ['future timestamp', rawRecord({ updatedAt: new Date(NOW + 120_000).toISOString(), expiresAt: new Date(NOW + 120_000 + ANONYMOUS_DRAFT_TTL_MS).toISOString() })], ['missing resume step', rawRecord({}, { resumeStep: undefined })], ['category mismatch', rawRecord({}, { issueType: 'collision' })], ['over-limit text', rawRecord({}, { summary: 'x'.repeat(1001) })]];

// prettier-ignore
describe('anonymous Free Start recovery', () => {
  afterEach(() => vi.useRealTimers());

  // prettier-ignore
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); installLocks(); });

  // prettier-ignore
  it('round-trips only eligible allowlisted facts', () => { expect(writeAnonymousDraft(localStorage, snapshot, null, NOW).status).toBe('saved'); expect(readAnonymousDraft(localStorage, NOW + 1)).toEqual(expect.objectContaining({ status: 'available', record: expect.objectContaining(snapshot) })); const raw = localStorage.getItem(ANONYMOUS_DRAFT_KEY)!; ['email', 'tenant', 'member', 'claimPack', 'activeId'].forEach(value => expect(raw).not.toContain(value)); expect(localStorage).toHaveLength(1); expect(createAnonymousDraftSnapshot('injury', snapshot.draft, 'details')).toBeNull(); localStorage.clear(); const medical = { ...snapshot, draft: { ...snapshot.draft, summary: 'Hospital treatment' } }; expect(writeAnonymousDraft(localStorage, medical, null, NOW).status).toBe('unavailable'); expect(localStorage).toHaveLength(0); });

  // prettier-ignore
  it.each(invalidRecords)('removes %s records without restoring', (_name, candidate) => { localStorage.setItem(ANONYMOUS_DRAFT_KEY, candidate); expect(readAnonymousDraft(localStorage, NOW).status).toBe('none'); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull(); });

  it('fails closed and blocks a same-millisecond stale tab', () => {
    // prettier-ignore
    const broken = { getItem: () => null, removeItem: vi.fn(), setItem: () => { throw new DOMException('quota'); } } as Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;
    expect(writeAnonymousDraft(null, snapshot, null, NOW).status).toBe('unavailable');
    expect(writeAnonymousDraft(broken, snapshot, null, NOW).status).toBe('unavailable');
    const first = writeAnonymousDraft(localStorage, snapshot, null, NOW);
    if (first.status !== 'saved') throw new Error('first write failed');
    expect(writeAnonymousDraft(localStorage, snapshot, null, NOW + 50).status).toBe('conflict');
    // prettier-ignore
    const newer = writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, counterparty: 'newer tab' } }, first.record, NOW);
    expect(newer.status).toBe('saved');
    if (newer.status !== 'saved') throw new Error('newer write failed');
    expect(newer.record.updatedAt).toBe(new Date(NOW + 1).toISOString());
    // prettier-ignore
    const stale = writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, counterparty: 'stale overwrite' } }, first.record, NOW);
    expect(stale.status).toBe('conflict');
    const final = readAnonymousDraft(localStorage, NOW);
    expect(final.status === 'available' && final.record.draft.counterparty).toBe('newer tab');
    localStorage.removeItem(ANONYMOUS_DRAFT_KEY);
    expect(writeAnonymousDraft(localStorage, snapshot, newer.record, NOW + 300).status).toBe('saved');
  });

  // prettier-ignore
  it('uses one bounded fixed lock and fails closed without it', async () => { const request = installLocks(); const task = vi.fn(() => 'done'); expect(await runAnonymousDraftLocked(task)).toEqual({ status: 'acquired', value: 'done' }); expect(request).toHaveBeenCalledWith(ANONYMOUS_DRAFT_LOCK_NAME, expect.objectContaining({ mode: 'exclusive', signal: expect.any(AbortSignal) }), expect.any(Function)); Object.defineProperty(navigator, 'locks', { configurable: true, get: () => undefined }); expect(await runAnonymousDraftLocked(task)).toEqual({ status: 'unavailable' }); expect(task).toHaveBeenCalledOnce(); });

  it('aborts a pending lock after five seconds and contains request rejection', async () => {
    vi.useFakeTimers();
    // prettier-ignore
    installLocks(vi.fn((_name, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))));
    const task = vi.fn();
    const pending = runAnonymousDraftLocked(task);
    await vi.advanceTimersByTimeAsync(5_001);
    expect(await pending).toEqual({ status: 'unavailable' });
    expect(task).not.toHaveBeenCalled();
    vi.useRealTimers();
    installLocks(vi.fn().mockRejectedValue(new Error('denied')));
    expect(await runAnonymousDraftLocked(task)).toEqual({ status: 'unavailable' });
  });

  it('preserves newest candidates, cleans empty malformed data and rejects derived future time', () => {
    localStorage.setItem(ANONYMOUS_DRAFT_KEY, '');
    expect(readAnonymousDraft(localStorage, NOW)).toEqual({ status: 'none' });
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull();
    const base = writeAnonymousDraft(localStorage, snapshot, null, NOW);
    if (base.status !== 'saved') throw new Error('base write failed');
    // prettier-ignore
    expect(writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, summary: 'older' } }, base.record, NOW + 1).status).toBe('saved');
    // prettier-ignore
    expect(writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, summary: 'newest' } }, base.record, NOW + 2).status).toBe('saved');
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('newest');
    localStorage.setItem(ANONYMOUS_DRAFT_KEY, rawRecord({ updatedAt: new Date(NOW + 60_000).toISOString(), expiresAt: new Date(NOW + 60_000 + ANONYMOUS_DRAFT_TTL_MS).toISOString() }));
    const future = readAnonymousDraft(localStorage, NOW);
    if (future.status !== 'available') throw new Error('future boundary missing');
    expect(writeAnonymousDraft(localStorage, snapshot, future.record, NOW).status).not.toBe('saved');
  });

  // prettier-ignore
  it('preserves later edits in both conditional-removal grant orders', () => { const first = writeAnonymousDraft(localStorage, snapshot, null, NOW); if (first.status !== 'saved') throw new Error('seed failed'); expect(removeAnonymousDraft(localStorage, first.record, NOW + 1).status).toBe('removed'); expect(writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, summary: 'Later edit.' } }, first.record, NOW + 2).status).toBe('saved'); localStorage.clear(); const seed = writeAnonymousDraft(localStorage, snapshot, null, NOW); if (seed.status !== 'saved') throw new Error('seed failed'); expect(writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, summary: 'Later first.' } }, seed.record, NOW + 2).status).toBe('saved'); expect(removeAnonymousDraft(localStorage, seed.record, NOW + 3).status).toBe('changed'); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Later first.'); });

  // prettier-ignore
  it('never mounts device recovery on a generic tenant host', async () => { const getItem = vi.spyOn(Storage.prototype, 'getItem'); const props = { activeId: null, category: 'property' as const, draft: snapshot.draft, lifecycleState: 'idle' as const, neutralHost: 'ida.interdomestik.com', onReset: vi.fn(), onRestore: vi.fn(), resetCategory: 'property' as const, step: 'details' as const }; const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await act(async () => Promise.resolve()); expect(hook.result.current.state).toBe('idle'); await expect(hook.result.current.clearBeforeReset()).resolves.toBe(true); expect(getItem).not.toHaveBeenCalled(); });

  // prettier-ignore
  it('requires an explicit fresh epoch after a sibling discard', async () => { const onReset = vi.fn(), props = { activeId: null, category: 'property' as const, draft: snapshot.draft, lifecycleState: 'idle' as const, neutralHost: globalThis.location.host, onReset, onRestore: vi.fn(), resetCategory: 'property' as const, step: 'details' as const }; const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await waitFor(() => expect(hook.result.current.state).toBe('saved')); act(() => { localStorage.removeItem(ANONYMOUS_DRAFT_KEY); globalThis.dispatchEvent(new StorageEvent('storage', { key: ANONYMOUS_DRAFT_KEY })); }); await waitFor(() => expect(hook.result.current.state).toBe('discarded')); expect(hook.result.current.enabled).toBe(false); act(() => hook.result.current.discard()); await waitFor(() => expect(onReset).toHaveBeenCalledOnce()); hook.rerender({ ...props, draft: { ...snapshot.draft, summary: 'Fresh epoch.' } }); await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Fresh epoch.')); });

  // prettier-ignore
  it('withdraws a recovery offer when storage becomes unavailable', async () => { writeAnonymousDraft(localStorage, snapshot, null, NOW); const props = { activeId: null, category: null, draft: snapshot.draft, lifecycleState: 'idle' as const, neutralHost: globalThis.location.host, onReset: vi.fn(), onRestore: vi.fn(), resetCategory: null, step: 'details' as const }; const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await waitFor(() => expect(hook.result.current.state).toBe('offer')); const available = localStorage; vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('blocked'); }); const event = new StorageEvent('storage', { key: ANONYMOUS_DRAFT_KEY }); Object.defineProperty(event, 'storageArea', { value: available }); act(() => globalThis.dispatchEvent(event)); await waitFor(() => expect(hook.result.current.state).toBe('unavailable')); expect(hook.result.current.offer).toBeNull(); expect(hook.result.current.enabled).toBe(false); });

  // prettier-ignore
  it('does not recreate a removed record or overwrite a changed form during resume', async () => { writeAnonymousDraft(localStorage, snapshot, null, NOW); const props = { activeId: null, category: 'property' as const, draft: snapshot.draft, lifecycleState: 'idle' as const, neutralHost: globalThis.location.host, onReset: vi.fn(), onRestore: vi.fn(), resetCategory: 'property' as const, step: 'preview' as const }; const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await waitFor(() => expect(hook.result.current.state).toBe('offer')); localStorage.removeItem(ANONYMOUS_DRAFT_KEY); act(() => hook.result.current.resume()); hook.rerender({ ...props, draft: { ...snapshot.draft, summary: 'Changed form wins.' } }); await act(async () => Promise.resolve()); expect(hook.result.current.state).toBe('offer'); expect(props.onRestore).not.toHaveBeenCalled(); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull(); act(() => hook.result.current.resume()); await waitFor(() => expect(hook.result.current.state).toBe('discarded')); await expect(hook.result.current.clearBeforeReset()).resolves.toBe(true); hook.rerender({ ...props, draft: { ...snapshot.draft, summary: 'New epoch.' } }); await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('New epoch.')); });

  // prettier-ignore
  it('clears only the exact securely saved facts and retains an edit made during save', async () => { writeAnonymousDraft(localStorage, snapshot, null, NOW); const initial: HookProps = { activeId: null, category: 'property', draft: snapshot.draft, lifecycleState: 'idle', neutralHost: globalThis.location.host, onReset: vi.fn(), onRestore: vi.fn(), resetCategory: 'property', step: 'preview' }; const hook = renderHook(props => useAnonymousDraftRecovery(props), { initialProps: initial }); await waitFor(() => expect(hook.result.current.state).toBe('offer')); act(() => hook.result.current.resume()); await waitFor(() => expect(initial.onRestore).toHaveBeenCalled()); hook.rerender({ ...initial, lifecycleState: 'saving' }); const edited = { ...initial, draft: { ...snapshot.draft, summary: 'Edit made during secure save.' }, lifecycleState: 'saving' as const }; hook.rerender(edited); hook.rerender({ ...edited, activeId: 'server-draft', lifecycleState: 'saved' }); await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Edit made during secure save.')); expect(hook.result.current.state).toBe('saved'); });

  it.each(['accessor denial', 'remove failure'])('does not reset after %s', async failure => {
    localStorage.setItem(ANONYMOUS_DRAFT_KEY, 'eligible-notes');
    const available = localStorage;
    if (failure === 'accessor denial') {
      vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
        throw new DOMException('blocked');
      });
    } else {
      // prettier-ignore
      vi.spyOn(globalThis, 'localStorage', 'get').mockReturnValue({ getItem: available.getItem.bind(available), removeItem: () => { throw new DOMException('blocked'); }, setItem: available.setItem.bind(available) } as unknown as Storage);
    }
    const startAnother = vi.fn();
    const clear = () =>
      ['none', 'removed'].includes(removeAnonymousDraft(getAnonymousDraftStorage()).status);
    await expect(resetAfterRecoveryClear(clear, startAnother)).resolves.toBe(false);
    expect(startAnother).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBe('eligible-notes');
  });

  // prettier-ignore
  it('keeps the member intake explicit-only and storage-neutral', () => { writeAnonymousDraft(localStorage, snapshot, null, NOW); const raw = localStorage.getItem(ANONYMOUS_DRAFT_KEY); const spies = ['getItem', 'setItem', 'removeItem'].map(method => vi.spyOn(Storage.prototype, method as 'getItem')); const props = { freeStartMessages: {}, locale: 'en', tenantId: 'tenant_ks' }; render(createElement(ClaimDraftIntake, props)); expect(screen.getByTestId('claim-draft-intake')).toHaveAttribute('data-save-behavior', 'explicit-only'); expect(screen.queryByTestId('anonymous-draft-recovery-offer')).not.toBeInTheDocument(); spies.forEach(spy => expect(spy).not.toHaveBeenCalled()); vi.restoreAllMocks(); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBe(raw); });
  // prettier-ignore
  it('does not let a sibling storage event cancel the newer pending local write', async () => { let grant: (() => void) | undefined; const request = vi.fn((_name, options, callback) => request.mock.calls.length === 2 ? new Promise((resolve, reject) => { grant = () => resolve(callback()); options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))); }) : Promise.resolve(callback())); installLocks(request); const props: HookProps = { activeId: null, category: null, draft: snapshot.draft, lifecycleState: 'idle', neutralHost: globalThis.location.host, onReset: vi.fn(), onRestore: vi.fn(), resetCategory: null, step: 'details' }; const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await waitFor(() => expect(request).toHaveBeenCalledOnce()); hook.rerender({ ...props, category: 'property' }); await waitFor(() => expect(request).toHaveBeenCalledTimes(2)); act(() => globalThis.dispatchEvent(new StorageEvent('storage', { key: ANONYMOUS_DRAFT_KEY }))); await act(async () => Promise.resolve()); expect(request).toHaveBeenCalledTimes(2); act(() => grant?.()); await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Water damaged two rooms.')); await waitFor(() => expect(hook.result.current.state).toBe('saved')); });
  // prettier-ignore
  it('defers destructive sibling cleanup until the next organizer load', async () => { const props: HookProps = { activeId: null, category: null, draft: snapshot.draft, lifecycleState: 'idle', neutralHost: globalThis.location.host, onReset: vi.fn(), onRestore: vi.fn(), resetCategory: null, step: 'details' }; const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await waitFor(() => expect(hook.result.current.ready).toBe(true)); localStorage.setItem(ANONYMOUS_DRAFT_KEY, '{'); act(() => globalThis.dispatchEvent(new StorageEvent('storage', { key: ANONYMOUS_DRAFT_KEY }))); await waitFor(() => expect(hook.result.current.state).toBe('discarded')); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBe('{'); hook.unmount(); const next = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await waitFor(() => expect(next.result.current.ready).toBe(true)); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull(); });
  // prettier-ignore
  it('preserves anonymous and secure restores from an injury organizer', async () => { writeAnonymousDraft(localStorage, snapshot, null); const onRestore = vi.fn(), props: HookProps = { activeId: null, category: 'injury', draft: { ...snapshot.draft, summary: 'Medical epoch.' }, lifecycleState: 'idle', neutralHost: globalThis.location.host, onReset: vi.fn(), onRestore, resetCategory: null, step: 'category' }; const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await waitFor(() => expect(hook.result.current.state).toBe('offer')); act(() => hook.result.current.resume()); await waitFor(() => expect(onRestore).toHaveBeenCalledWith(expect.objectContaining(snapshot))); hook.rerender({ ...props, category: 'property', draft: snapshot.draft, step: 'preview' }); await act(async () => Promise.resolve()); expect(onRestore).toHaveBeenCalledTimes(1); hook.unmount(); localStorage.clear(); const secure = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await waitFor(() => expect(secure.result.current.ready).toBe(true)); secure.rerender({ ...props, activeId: 'server-b', category: 'property', draft: snapshot.draft, lifecycleState: 'saved', step: 'preview' }); await act(async () => Promise.resolve()); expect(onRestore).toHaveBeenCalledTimes(1); });
});
