import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaimDraftIntake } from '@/components/claims/claim-draft-intake';

import {
  ANONYMOUS_DRAFT_KEY,
  ANONYMOUS_DRAFT_TTL_MS,
  createAnonymousDraftSnapshot,
  getAnonymousDraftStorage,
  readAnonymousDraft,
  removeAnonymousDraft,
  writeAnonymousDraft,
  type AnonymousDraftSnapshot,
} from './anonymous-draft-recovery';
import { resetAfterRecoveryClear } from './index';
import { useAnonymousDraftRecovery } from './use-anonymous-draft-recovery';

vi.mock('next-intl', async () => {
  const [{ default: claims }, { default: diaspora }, { default: freeStart }, helper] =
    await Promise.all([
      import('@/messages/en/claims.json'),
      import('@/messages/en/diaspora.json'),
      import('@/messages/en/freeStart.json'),
      import('@/test/next-intl-mock'),
    ]);
  return {
    NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
    useLocale: () => 'en',
    useTranslations: helper.createUseTranslationsMock(() => ({
      claims: claims.claims,
      diaspora: diaspora.diaspora,
      freeStart: freeStart.freeStart,
    })),
  };
});
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
function rawRecord(recordPatch: Record<string, unknown> = {}, draftPatch: Record<string, unknown> = {}) { writeAnonymousDraft(localStorage, snapshot, null, NOW); const record = JSON.parse(localStorage.getItem(ANONYMOUS_DRAFT_KEY)!); return JSON.stringify({ ...record, ...recordPatch, draft: { ...record.draft, ...draftPatch } }); }
// prettier-ignore
const invalidRecords = [['malformed', '{'], ['unknown version', rawRecord({ version: 2 })], ['expired', rawRecord({ expiresAt: new Date(NOW - 1).toISOString() })], ['extended TTL', rawRecord({ expiresAt: new Date(NOW + ANONYMOUS_DRAFT_TTL_MS + 1).toISOString() })], ['future timestamp', rawRecord({ updatedAt: new Date(NOW + 120_000).toISOString(), expiresAt: new Date(NOW + 120_000 + ANONYMOUS_DRAFT_TTL_MS).toISOString() })], ['missing resume step', rawRecord({}, { resumeStep: undefined })], ['category mismatch', rawRecord({}, { issueType: 'collision' })], ['over-limit text', rawRecord({}, { summary: 'x'.repeat(1001) })]];

describe('anonymous Free Start recovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('round-trips only eligible allowlisted facts', () => {
    expect(writeAnonymousDraft(localStorage, snapshot, null, NOW).status).toBe('saved');
    expect(readAnonymousDraft(localStorage, NOW + 1)).toEqual(
      expect.objectContaining({ status: 'available', record: expect.objectContaining(snapshot) })
    );
    const raw = localStorage.getItem(ANONYMOUS_DRAFT_KEY)!;
    ['email', 'tenant', 'member', 'claimPack', 'activeId'].forEach(value =>
      expect(raw).not.toContain(value)
    );
    expect(localStorage).toHaveLength(1);
    expect(createAnonymousDraftSnapshot('injury', snapshot.draft, 'details')).toBeNull();
    localStorage.clear();
    const medical = { ...snapshot, draft: { ...snapshot.draft, summary: 'Hospital treatment' } };
    expect(writeAnonymousDraft(localStorage, medical, null, NOW).status).toBe('unavailable');
    expect(localStorage).toHaveLength(0);
  });

  it.each(invalidRecords)('removes %s records without restoring', (_name, candidate) => {
    localStorage.setItem(ANONYMOUS_DRAFT_KEY, candidate);
    expect(readAnonymousDraft(localStorage, NOW).status).toBe('none');
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull();
  });

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
    expect(writeAnonymousDraft(localStorage, snapshot, newer.record, NOW + 300).status).toBe(
      'stale'
    );
  });

  // prettier-ignore
  it('never mounts device recovery on a generic tenant host', async () => { const getItem = vi.spyOn(Storage.prototype, 'getItem'); const props = { activeId: null, category: 'property' as const, draft: snapshot.draft, lifecycleState: 'idle' as const, neutralHost: 'ida.interdomestik.com', onReset: vi.fn(), onRestore: vi.fn(), resetCategory: 'property' as const, step: 'details' as const }; const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await act(async () => Promise.resolve()); expect(hook.result.current.state).toBe('idle'); expect(hook.result.current.clearBeforeReset()).toBe(true); expect(getItem).not.toHaveBeenCalled(); });

  // prettier-ignore
  it('does not resurrect a draft removed by a sibling tab', async () => { const props = { activeId: null, category: 'property' as const, draft: snapshot.draft, lifecycleState: 'idle' as const, neutralHost: globalThis.location.host, onReset: vi.fn(), onRestore: vi.fn(), resetCategory: 'property' as const, step: 'details' as const }; const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await waitFor(() => expect(hook.result.current.state).toBe('saved')); act(() => { localStorage.removeItem(ANONYMOUS_DRAFT_KEY); globalThis.dispatchEvent(new StorageEvent('storage', { key: ANONYMOUS_DRAFT_KEY })); }); hook.rerender({ ...props, draft: { ...snapshot.draft, summary: 'A stale tab edit must stay local only.' } }); await act(async () => Promise.resolve()); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull(); });

  // prettier-ignore
  it('withdraws a recovery offer when storage becomes unavailable', async () => { writeAnonymousDraft(localStorage, snapshot, null, NOW); const props = { activeId: null, category: null, draft: snapshot.draft, lifecycleState: 'idle' as const, neutralHost: globalThis.location.host, onReset: vi.fn(), onRestore: vi.fn(), resetCategory: null, step: 'details' as const }; const hook = renderHook(value => useAnonymousDraftRecovery(value), { initialProps: props }); await waitFor(() => expect(hook.result.current.state).toBe('offer')); const available = localStorage; vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('blocked'); }); const event = new StorageEvent('storage', { key: ANONYMOUS_DRAFT_KEY }); Object.defineProperty(event, 'storageArea', { value: available }); act(() => globalThis.dispatchEvent(event)); await waitFor(() => expect(hook.result.current.state).toBe('unavailable')); expect(hook.result.current.offer).toBeNull(); expect(hook.result.current.enabled).toBe(false); });

  // prettier-ignore
  it('clears only after saving to saved with an active id', async () => { writeAnonymousDraft(localStorage, snapshot, null, NOW); const initial: HookProps = { activeId: null, category: 'property', draft: snapshot.draft, lifecycleState: 'idle', neutralHost: globalThis.location.host, onReset: vi.fn(), onRestore: vi.fn(), resetCategory: 'property', step: 'category' }; const hook = renderHook(props => useAnonymousDraftRecovery(props), { initialProps: initial }); await waitFor(() => expect(hook.result.current.state).toBe('offer')); act(() => hook.result.current.discard()); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull(); hook.unmount(); writeAnonymousDraft(localStorage, snapshot, null, NOW); const secureInitial: HookProps = { ...initial, draft: { ...snapshot.draft, counterparty: '  Northwind Insurance  ', summary: 'Water damaged two rooms.\r\n' }, step: 'preview' }; const secureHook = renderHook(props => useAnonymousDraftRecovery(props), { initialProps: secureInitial }); await waitFor(() => expect(secureHook.result.current.state).toBe('offer')); act(() => secureHook.result.current.resume()); const next = (lifecycleState: HookProps['lifecycleState']): HookProps => ({ ...secureInitial, activeId: 'server-draft', lifecycleState }); secureHook.rerender(next('saved')); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).not.toBeNull(); secureHook.rerender(next('saving')); secureHook.rerender(next('error')); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).not.toBeNull(); secureHook.rerender(next('saving')); secureHook.rerender(next('saved')); await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull()); });

  it.each(['accessor denial', 'remove failure'])('does not reset after %s', failure => {
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
    expect(resetAfterRecoveryClear(clear, startAnother)).toBe(false);
    expect(startAnother).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBe('eligible-notes');
  });

  // prettier-ignore
  it('keeps the member intake explicit-only and storage-neutral', () => { writeAnonymousDraft(localStorage, snapshot, null, NOW); const raw = localStorage.getItem(ANONYMOUS_DRAFT_KEY); const spies = ['getItem', 'setItem', 'removeItem'].map(method => vi.spyOn(Storage.prototype, method as 'getItem')); const props = { freeStartMessages: {}, locale: 'en', tenantId: 'tenant_ks' }; render(createElement(ClaimDraftIntake, props)); expect(screen.getByTestId('claim-draft-intake')).toHaveAttribute('data-save-behavior', 'explicit-only'); expect(screen.queryByTestId('anonymous-draft-recovery-offer')).not.toBeInTheDocument(); spies.forEach(spy => expect(spy).not.toHaveBeenCalled()); vi.restoreAllMocks(); expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBe(raw); });
});
