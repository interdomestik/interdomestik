import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaimDraftIntake } from '@/components/claims/claim-draft-intake';

// prettier-ignore
import { ANONYMOUS_DRAFT_KEY, ANONYMOUS_DRAFT_LOCK_NAME, ANONYMOUS_DRAFT_TTL_MS, createAnonymousDraftSnapshot, getAnonymousDraftStorage, readAnonymousDraft, removeAnonymousDraft, runAnonymousDraftLocked, writeAnonymousDraft, type AnonymousDraftSnapshot } from './anonymous-draft-recovery';
import { resetAfterRecoveryClear } from './index';
import { draftFingerprint } from './types';
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
function captureTaskTurns() { const scheduled = globalThis.setTimeout, turns: Array<() => void> = []; vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: TimerHandler, delay?: number, ...args: unknown[]) => delay === 0 ? (turns.push(() => { if (typeof callback === 'function') callback(...args); }), 1 as unknown as ReturnType<typeof setTimeout>) : scheduled(callback, delay, ...args)) as typeof setTimeout); return turns; }

// prettier-ignore
function rawRecord(recordPatch: Record<string, unknown> = {}, draftPatch: Record<string, unknown> = {}) { writeAnonymousDraft(localStorage, snapshot, null, NOW); const record = JSON.parse(localStorage.getItem(ANONYMOUS_DRAFT_KEY)!); return JSON.stringify({ ...record, ...recordPatch, draft: { ...record.draft, ...draftPatch } }); }
// prettier-ignore
const invalidRecords = [['malformed', '{'], ['unknown version', rawRecord({ version: 2 })], ['expired', rawRecord({ expiresAt: new Date(NOW - 1).toISOString() })], ['extended TTL', rawRecord({ expiresAt: new Date(NOW + ANONYMOUS_DRAFT_TTL_MS + 1).toISOString() })], ['future timestamp', rawRecord({ updatedAt: new Date(NOW + 120_000).toISOString(), expiresAt: new Date(NOW + 120_000 + ANONYMOUS_DRAFT_TTL_MS).toISOString() })], ['missing resume step', rawRecord({}, { resumeStep: undefined })], ['category mismatch', rawRecord({}, { issueType: 'collision' })], ['over-limit text', rawRecord({}, { summary: 'x'.repeat(1001) })], ['medical inflection', rawRecord({}, { summary: 'I fractured my arm.' })], ['medical counterparty', rawRecord({}, { counterparty: 'Dr Smith treated my fracture.' })]];

// prettier-ignore
describe('anonymous Free Start recovery', () => {
  afterEach(() => vi.useRealTimers());

  // prettier-ignore
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); installLocks(); });

  // prettier-ignore
  it('round-trips only eligible allowlisted facts', () => { expect(writeAnonymousDraft(localStorage, snapshot, null, NOW).status).toBe('saved'); expect(readAnonymousDraft(localStorage, NOW + 1)).toEqual(expect.objectContaining({ status: 'available', record: expect.objectContaining(snapshot) })); const raw = localStorage.getItem(ANONYMOUS_DRAFT_KEY)!; ['email', 'tenant', 'member', 'claimPack', 'activeId'].forEach(value => expect(raw).not.toContain(value)); expect(localStorage).toHaveLength(1); expect(createAnonymousDraftSnapshot('injury', snapshot.draft, 'details')).toBeNull(); localStorage.clear(); for (const draft of [{ ...snapshot.draft, summary: 'Hospital treatment' }, { ...snapshot.draft, summary: 'I fractured my arm.' }, { ...snapshot.draft, counterparty: 'Dr Smith treated my fracture.' }]) expect(writeAnonymousDraft(localStorage, { ...snapshot, draft }, null, NOW).status).toBe('unavailable'); expect(localStorage).toHaveLength(0); });

  // prettier-ignore
  it.each(invalidRecords)('removes %s records without restoring', (_name, candidate) => { localStorage.setItem(ANONYMOUS_DRAFT_KEY, candidate); expect(readAnonymousDraft(localStorage, NOW).status).toBe('none'); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull(); localStorage.setItem(ANONYMOUS_DRAFT_KEY, candidate); const available = localStorage, stuck = { getItem: available.getItem.bind(available), removeItem: () => { throw new DOMException('blocked'); }, setItem: available.setItem.bind(available) }; expect(writeAnonymousDraft(stuck, snapshot, null, NOW, NOW).status).toBe('invalid'); localStorage.clear(); });

  it('keeps the newest cold-tab candidate and blocks a same-millisecond stale tab', () => {
    // prettier-ignore
    const broken = { getItem: () => null, removeItem: vi.fn(), setItem: () => { throw new DOMException('quota'); } } as Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;
    expect(writeAnonymousDraft(null, snapshot, null, NOW).status).toBe('unavailable');
    expect(writeAnonymousDraft(broken, snapshot, null, NOW).status).toBe('unavailable');
    const first = writeAnonymousDraft(localStorage, snapshot, null, NOW);
    if (first.status !== 'saved') throw new Error('first write failed');
    // prettier-ignore
    const coldNewer = writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, counterparty: 'newer cold tab' } }, null, NOW + 50);
    expect(coldNewer.status).toBe('saved');
    if (coldNewer.status !== 'saved') throw new Error('cold newer write failed');
    // prettier-ignore
    expect(writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, counterparty: 'same-time stale tab' } }, null, NOW + 50).status).toBe('conflict');
    // prettier-ignore
    const newer = writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, counterparty: 'newer tab' } }, coldNewer.record, NOW + 50);
    expect(newer.status).toBe('saved');
    if (newer.status !== 'saved') throw new Error('newer write failed');
    expect(newer.record.updatedAt).toBe(new Date(NOW + 51).toISOString());
    // prettier-ignore
    const stale = writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, counterparty: 'stale overwrite' } }, coldNewer.record, NOW + 50);
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
    expect(writeAnonymousDraft(localStorage, snapshot, future.record, NOW, NOW).status).not.toBe('saved');
  });

  // prettier-ignore
  it('preserves later edits in both conditional-removal grant orders', () => { const first = writeAnonymousDraft(localStorage, snapshot, null, NOW); if (first.status !== 'saved') throw new Error('seed failed'); expect(removeAnonymousDraft(localStorage, first.record, NOW + 1).status).toBe('removed'); expect(writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, summary: 'Later edit.' } }, first.record, NOW + 2).status).toBe('saved'); localStorage.clear(); const seed = writeAnonymousDraft(localStorage, snapshot, null, NOW); if (seed.status !== 'saved') throw new Error('seed failed'); expect(writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, summary: 'Later first.' } }, seed.record, NOW + 2).status).toBe('saved'); expect(removeAnonymousDraft(localStorage, seed.record, NOW + 3).status).toBe('changed'); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Later first.'); });

  // prettier-ignore
  it('rejects generic or mismatched production authority but accepts canonical ida.localhost', async () => { const getItem = vi.spyOn(Storage.prototype, 'getItem'), props = { activeId: null, category: 'property' as const, draft: snapshot.draft, lifecycleState: 'idle' as const, neutralHost: 'ida.interdomestik.com', onReset: vi.fn(), onRestore: vi.fn(), resetCategory: 'property' as const, step: 'details' as const }; const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await act(async () => Promise.resolve()); expect(hook.result.current.state).toBe('idle'); await expect(hook.result.current.clearBeforeReset()).resolves.toBe(true); expect(getItem).not.toHaveBeenCalled(); hook.unmount(); getItem.mockRestore(); vi.stubGlobal('location', { host: 'ida.localhost:3101', hostname: 'ida.localhost' }); const local = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: { ...props, neutralHost: null } }); await waitFor(() => expect(local.result.current.state).toBe('saved')); local.unmount(); vi.unstubAllGlobals(); });

  // prettier-ignore
  it('requires an explicit fresh epoch after a sibling discard', async () => { const onReset = vi.fn(), props = { activeId: null, category: 'property' as const, draft: snapshot.draft, lifecycleState: 'idle' as const, neutralHost: globalThis.location.host, onReset, onRestore: vi.fn(), resetCategory: 'property' as const, step: 'details' as const }; const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await waitFor(() => expect(hook.result.current.state).toBe('saved')); act(() => { localStorage.removeItem(ANONYMOUS_DRAFT_KEY); globalThis.dispatchEvent(new StorageEvent('storage', { key: ANONYMOUS_DRAFT_KEY })); }); await waitFor(() => expect(hook.result.current.state).toBe('discarded')); expect(hook.result.current.enabled).toBe(false); act(() => hook.result.current.discard()); await waitFor(() => expect(onReset).toHaveBeenCalledOnce()); expect(hook.result.current.enabled).toBe(true); hook.rerender({ ...props, draft: { ...snapshot.draft, summary: 'Fresh epoch.' } }); await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Fresh epoch.')); });

  // prettier-ignore
  it('withdraws an offer but reports its known copy as retained when storage becomes unavailable', async () => { writeAnonymousDraft(localStorage, snapshot, null, NOW); const props = { activeId: null, category: null, draft: snapshot.draft, lifecycleState: 'idle' as const, neutralHost: globalThis.location.host, onReset: vi.fn(), onRestore: vi.fn(), resetCategory: null, step: 'details' as const }; const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await waitFor(() => expect(hook.result.current.state).toBe('offer')); const available = localStorage; vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('blocked'); }); const event = new StorageEvent('storage', { key: ANONYMOUS_DRAFT_KEY }); Object.defineProperty(event, 'storageArea', { value: available }); act(() => globalThis.dispatchEvent(event)); await waitFor(() => expect(hook.result.current.state).toBe('retained')); expect(hook.result.current.offer).toBeNull(); expect(hook.result.current.enabled).toBe(false); });

  // prettier-ignore
  it('does not recreate a removed record or overwrite a changed form during resume', async () => { writeAnonymousDraft(localStorage, snapshot, null, NOW); const props = { activeId: null, category: 'property' as const, draft: snapshot.draft, lifecycleState: 'idle' as const, neutralHost: globalThis.location.host, onReset: vi.fn(), onRestore: vi.fn(), resetCategory: 'property' as const, step: 'preview' as const }; const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await waitFor(() => expect(hook.result.current.state).toBe('offer')); localStorage.removeItem(ANONYMOUS_DRAFT_KEY); act(() => hook.result.current.resume()); hook.rerender({ ...props, draft: { ...snapshot.draft, summary: 'Changed form wins.' } }); await waitFor(() => expect(hook.result.current.busy).toBe(false)); expect(hook.result.current.state).toBe('offer'); expect(props.onRestore).not.toHaveBeenCalled(); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull(); act(() => hook.result.current.resume()); await waitFor(() => expect(hook.result.current.state).toBe('discarded')); await expect(hook.result.current.clearBeforeReset()).resolves.toBe(true); hook.rerender({ ...props, draft: { ...snapshot.draft, summary: 'New epoch.' } }); await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('New epoch.')); });

  // prettier-ignore
  it('clears only the exact securely saved facts and retains an edit made during save', async () => { writeAnonymousDraft(localStorage, snapshot, null, NOW); const initial: HookProps = { activeId: null, category: 'property', draft: snapshot.draft, lifecycleState: 'idle', neutralHost: globalThis.location.host, onReset: vi.fn(), onRestore: vi.fn(), resetCategory: 'property', step: 'preview' }; const hook = renderHook(props => useAnonymousDraftRecovery(props), { initialProps: initial }); await waitFor(() => expect(hook.result.current.state).toBe('offer')); act(() => hook.result.current.resume()); await waitFor(() => { expect(initial.onRestore).toHaveBeenCalled(); expect(hook.result.current.offer).toBeNull(); expect(hook.result.current.state).toBe('saved'); }); hook.rerender({ ...initial, lifecycleState: 'saving' }); await act(async () => Promise.resolve()); const edited = { ...initial, draft: { ...snapshot.draft, summary: 'Edit made during secure save.' }, lifecycleState: 'saving' as const }; hook.rerender(edited); hook.rerender({ ...edited, activeFingerprint: draftFingerprint(initial.category, initial.draft, initial.step), activeId: 'server-draft', lifecycleState: 'saved' }); await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Edit made during secure save.')); expect(hook.result.current.state).toBe('saved'); });

  // prettier-ignore
  it.each(['accessor denial', 'remove failure'])('does not reset after %s', async failure => { localStorage.setItem(ANONYMOUS_DRAFT_KEY, 'eligible-notes'); const available = localStorage; if (failure === 'accessor denial') vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('blocked'); }); else vi.spyOn(globalThis, 'localStorage', 'get').mockReturnValue({ getItem: available.getItem.bind(available), removeItem: () => { throw new DOMException('blocked'); }, setItem: available.setItem.bind(available) } as unknown as Storage); const startAnother = vi.fn(), clear = () => ['none', 'removed'].includes(removeAnonymousDraft(getAnonymousDraftStorage()).status); await expect(resetAfterRecoveryClear(clear, startAnother)).resolves.toBe(false); expect(startAnother).not.toHaveBeenCalled(); vi.restoreAllMocks(); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBe('eligible-notes'); });

  // prettier-ignore
  it('keeps the member intake explicit-only and storage-neutral', () => { writeAnonymousDraft(localStorage, snapshot, null, NOW); const raw = localStorage.getItem(ANONYMOUS_DRAFT_KEY); const spies = ['getItem', 'setItem', 'removeItem'].map(method => vi.spyOn(Storage.prototype, method as 'getItem')); const props = { freeStartMessages: {}, locale: 'en', tenantId: 'tenant_ks' }; render(createElement(ClaimDraftIntake, props)); expect(screen.getByTestId('claim-draft-intake')).toHaveAttribute('data-save-behavior', 'explicit-only'); expect(screen.queryByTestId('anonymous-draft-recovery-offer')).not.toBeInTheDocument(); spies.forEach(spy => expect(spy).not.toHaveBeenCalled()); vi.restoreAllMocks(); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBe(raw); });
  // prettier-ignore
  it('does not cancel a pending write and persists the edit that completes reconciliation', async () => { let grant: (() => void) | undefined; const request = vi.fn((_name, options, callback) => request.mock.calls.length === 2 ? new Promise((resolve, reject) => { grant = () => resolve(callback()); options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))); }) : Promise.resolve(callback())); installLocks(request); const props: HookProps = { activeId: null, category: null, draft: snapshot.draft, lifecycleState: 'idle', neutralHost: globalThis.location.host, onReset: vi.fn(), onRestore: vi.fn(), resetCategory: null, step: 'details' }; const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await waitFor(() => expect(request).toHaveBeenCalledOnce()); hook.rerender({ ...props, category: 'property' }); await waitFor(() => expect(request).toHaveBeenCalledTimes(2)); act(() => globalThis.dispatchEvent(new StorageEvent('storage', { key: ANONYMOUS_DRAFT_KEY }))); await act(async () => Promise.resolve()); expect(request).toHaveBeenCalledTimes(2); act(() => grant?.()); await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Water damaged two rooms.')); await waitFor(() => expect(hook.result.current.state).toBe('saved')); vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('blocked'); }); act(() => globalThis.dispatchEvent(new StorageEvent('storage', { key: ANONYMOUS_DRAFT_KEY }))); await waitFor(() => expect(hook.result.current.state).toBe('retained')); vi.restoreAllMocks(); installLocks(); hook.rerender({ ...props, category: 'property', draft: { ...snapshot.draft, summary: 'Reconciled edit persists.' } }); await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Reconciled edit persists.')); });
  // prettier-ignore
  it('preserves a same-millisecond user edit when a locked reset removes the prior revision first', async () => { const seed = writeAnonymousDraft(localStorage, snapshot, null, NOW); if (seed.status !== 'saved') throw new Error('seed failed'); let tail = Promise.resolve<unknown>(undefined); installLocks(vi.fn((_name, _options, callback) => { const run = tail.then(callback); tail = run.then(() => undefined, () => undefined); return run; })); const reset = runAnonymousDraftLocked(() => removeAnonymousDraft(localStorage, seed.record, NOW)), edit = runAnonymousDraftLocked(() => writeAnonymousDraft(localStorage, { ...snapshot, draft: { ...snapshot.draft, summary: 'Same-millisecond edit.' } }, seed.record, NOW, NOW)); await expect(reset).resolves.toEqual(expect.objectContaining({ status: 'acquired', value: { status: 'removed' } })); await expect(edit).resolves.toEqual(expect.objectContaining({ status: 'acquired', value: expect.objectContaining({ status: 'saved' }) })); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain('Same-millisecond edit.'); });
  // prettier-ignore
  it('never labels failed invalid-sibling cleanup as a retained eligible copy', async () => { writeAnonymousDraft(localStorage, snapshot, null, NOW); const props: HookProps = { activeId: null, category: null, draft: snapshot.draft, lifecycleState: 'idle', neutralHost: globalThis.location.host, onReset: vi.fn(), onRestore: vi.fn(), resetCategory: null, step: 'details' }; const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await waitFor(() => expect(hook.result.current.state).toBe('offer')); const available = localStorage; localStorage.setItem(ANONYMOUS_DRAFT_KEY, '{'); vi.spyOn(globalThis, 'localStorage', 'get').mockReturnValue({ getItem: available.getItem.bind(available), removeItem: () => { throw new DOMException('blocked'); }, setItem: available.setItem.bind(available) } as unknown as Storage); act(() => globalThis.dispatchEvent(new StorageEvent('storage', { key: ANONYMOUS_DRAFT_KEY }))); await waitFor(() => expect(hook.result.current.state).toBe('unavailable')); expect(hook.result.current.state).not.toBe('retained'); expect(hook.result.current.offer).toBeNull(); });
  // prettier-ignore
  it('preserves anonymous and secure restores from an injury organizer', async () => { writeAnonymousDraft(localStorage, snapshot, null); const onRestore = vi.fn(), props: HookProps = { activeId: null, category: 'injury', draft: { ...snapshot.draft, summary: 'Medical epoch.' }, lifecycleState: 'idle', neutralHost: globalThis.location.host, onReset: vi.fn(), onRestore, resetCategory: null, step: 'category' }; const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await waitFor(() => expect(hook.result.current.state).toBe('offer')); act(() => hook.result.current.resume()); await waitFor(() => expect(onRestore).toHaveBeenCalledWith(expect.objectContaining(snapshot))); hook.rerender({ ...props, category: 'property', draft: snapshot.draft, step: 'preview' }); await act(async () => Promise.resolve()); expect(onRestore).toHaveBeenCalledTimes(1); hook.unmount(); localStorage.clear(); const secure = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await waitFor(() => expect(secure.result.current.ready).toBe(true)); secure.rerender({ ...props, activeId: 'server-b', category: 'property', draft: snapshot.draft, lifecycleState: 'saved', step: 'preview' }); await act(async () => Promise.resolve()); expect(onRestore).toHaveBeenCalledTimes(1); });
  // prettier-ignore
  it.each([1, 2])('holds lock through task-turn barrier %s and times a sibling out', async barrier => { vi.useFakeTimers(); const turns = captureTaskTurns(); type Queued = { run: () => void; started: boolean }; const queue: Queued[] = []; let active = false; const drain = () => { if (active) return; const entry = queue.shift(); if (!entry) return; active = entry.started = true; entry.run(); }; installLocks(vi.fn((_name, options, callback) => new Promise((resolve, reject) => { const entry: Queued = { started: false, run: () => { Promise.resolve(callback()).then(resolve, reject).finally(() => { active = false; drain(); }); } }; queue.push(entry); options.signal.addEventListener('abort', () => { if (!entry.started) { const index = queue.indexOf(entry); if (index >= 0) queue.splice(index, 1); reject(new DOMException('aborted', 'AbortError')); } }, { once: true }); drain(); }))); const holder = runAnonymousDraftLocked(() => writeAnonymousDraft(localStorage, snapshot, null, NOW)); await Promise.resolve(); expect(turns).toHaveLength(1); if (barrier === 2) { turns.shift()?.(); await Promise.resolve(); expect(turns).toHaveLength(1); } const sibling = runAnonymousDraftLocked(() => writeAnonymousDraft(localStorage, snapshot, null, NOW + 1)); await vi.advanceTimersByTimeAsync(4_999); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull(); await vi.advanceTimersByTimeAsync(1); await expect(sibling).resolves.toEqual({ status: 'unavailable' }); turns.shift()?.(); await Promise.resolve(); turns.shift()?.(); await expect(holder).resolves.toEqual(expect.objectContaining({ status: 'acquired', value: expect.objectContaining({ status: 'saved' }) })); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toContain(snapshot.draft.summary); });
  // prettier-ignore
  it.each([[1, 'superseded'], [2, 'superseded'], [1, 'expired'], [2, 'expired']] as const)('rechecks safety at task-turn barrier %s for %s work', async (barrier, mode) => { let current = true; const turns = captureTaskTurns(), clock = vi.spyOn(Date, 'now').mockReturnValue(NOW), pending = runAnonymousDraftLocked(() => current ? writeAnonymousDraft(localStorage, snapshot, null, NOW, Date.now()) : null); await Promise.resolve(); expect(turns).toHaveLength(1); if (barrier === 2) { turns.shift()?.(); await Promise.resolve(); expect(turns).toHaveLength(1); } if (mode === 'superseded') current = false; else clock.mockReturnValue(NOW + ANONYMOUS_DRAFT_TTL_MS); turns.shift()?.(); await Promise.resolve(); turns.shift()?.(); await expect(pending).resolves.toEqual(expect.objectContaining({ status: 'acquired', value: mode === 'superseded' ? null : { status: 'stale' } })); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull(); });
  // prettier-ignore
  it('uses execution time inside the lock and never saves an expired captured candidate', async () => { vi.useFakeTimers(); vi.spyOn(Date, 'now').mockReturnValue(NOW + ANONYMOUS_DRAFT_TTL_MS); const expired = runAnonymousDraftLocked(() => writeAnonymousDraft(localStorage, snapshot, null, NOW, Date.now())); await vi.runAllTimersAsync(); await expect(expired).resolves.toEqual(expect.objectContaining({ status: 'acquired', value: { status: 'stale' } })); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull(); vi.mocked(Date.now).mockReturnValue(NOW + ANONYMOUS_DRAFT_TTL_MS - 1); const eligible = runAnonymousDraftLocked(() => writeAnonymousDraft(localStorage, snapshot, null, NOW, Date.now())); await vi.runAllTimersAsync(); await expect(eligible).resolves.toEqual(expect.objectContaining({ status: 'acquired', value: expect.objectContaining({ status: 'saved' }) })); });
  // prettier-ignore
  it('fails closed when timer setup or cleanup throws', async () => { const task = vi.fn(() => 'unsafe'); vi.spyOn(globalThis, 'setTimeout').mockImplementation(() => { throw new Error('timer setup'); }); await expect(runAnonymousDraftLocked(task)).resolves.toEqual({ status: 'unavailable' }); vi.restoreAllMocks(); installLocks(); vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => { throw new Error('timer cleanup'); }); await expect(runAnonymousDraftLocked(task)).resolves.toEqual({ status: 'unavailable' }); expect(task).not.toHaveBeenCalled(); });
});
