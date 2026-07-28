import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaimDraftIntake } from '@/components/claims/claim-draft-intake';

import {
  ANONYMOUS_DRAFT_KEY,
  createAnonymousDraftSnapshot,
  readAnonymousDraft,
  writeAnonymousDraft,
  type AnonymousDraftSnapshot,
} from './anonymous-draft-recovery';
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
const actions = vi.hoisted(() => ({ create: vi.fn(), delete: vi.fn(), list: vi.fn(), resume: vi.fn(), update: vi.fn() }));
// prettier-ignore
vi.mock('@/actions/free-start-drafts', () => ({ createFreeStartDraft: actions.create, deleteFreeStartDraft: actions.delete, listFreeStartDrafts: actions.list, resumeFreeStartDraft: actions.resume, updateFreeStartDraft: actions.update }));

const NOW = Date.parse('2026-07-28T12:00:00.000Z');
// prettier-ignore
const snapshot: AnonymousDraftSnapshot = { category: 'property', draft: { counterparty: 'Northwind Insurance', desiredOutcome: 'repair', incidentDate: '2026-07-15', issueType: 'water_damage', summary: 'Water damaged two rooms.' }, resumeStep: 'preview' };
type HookProps = Parameters<typeof useAnonymousDraftRecovery>[0];

function rawRecord(
  recordPatch: Record<string, unknown> = {},
  draftPatch: Record<string, unknown> = {}
) {
  writeAnonymousDraft(localStorage, snapshot, null, NOW);
  const record = JSON.parse(localStorage.getItem(ANONYMOUS_DRAFT_KEY)!);
  // prettier-ignore
  return JSON.stringify({ ...record, ...recordPatch, draft: { ...record.draft, ...draftPatch } });
}

describe('anonymous Free Start recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
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

  it.each([
    ['malformed', '{'],
    ['unknown version', rawRecord({ version: 2 })],
    ['expired', rawRecord({ expiresAt: new Date(NOW - 1).toISOString() })],
    ['category mismatch', rawRecord({}, { issueType: 'collision' })],
    ['over-limit text', rawRecord({}, { summary: 'x'.repeat(1001) })],
  ])('removes %s records without restoring', (_name, candidate) => {
    localStorage.setItem(ANONYMOUS_DRAFT_KEY, candidate);
    expect(readAnonymousDraft(localStorage, NOW).status).toBe('none');
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull();
  });

  it('fails closed on storage errors and blocks a stale tab', () => {
    // prettier-ignore
    const broken = { getItem: () => null, removeItem: vi.fn(), setItem: () => { throw new DOMException('quota'); } } as Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;
    expect(writeAnonymousDraft(null, snapshot, null, NOW).status).toBe('unavailable');
    expect(writeAnonymousDraft(broken, snapshot, null, NOW).status).toBe('unavailable');
    const first = writeAnonymousDraft(localStorage, snapshot, null, NOW);
    const firstStamp = first.status === 'saved' ? first.updatedAt : '';
    expect(writeAnonymousDraft(localStorage, snapshot, firstStamp, NOW + 100).status).toBe('saved');
    const stale = writeAnonymousDraft(localStorage, snapshot, firstStamp, NOW + 200);
    expect(stale.status).toBe('conflict');
    expect((stale as { record: { draft: unknown } }).record.draft).toEqual(snapshot.draft);
  });

  it('clears only after saving to saved with an active id', async () => {
    writeAnonymousDraft(localStorage, snapshot, null, NOW);
    const callbacks = { onReset: vi.fn(), onRestore: vi.fn() };
    const initial: HookProps = {
      activeId: null,
      category: null,
      draft: snapshot.draft,
      lifecycleState: 'idle',
      step: 'category',
      ...callbacks,
    };
    const hook = renderHook(props => useAnonymousDraftRecovery(props), {
      initialProps: initial,
    });
    await waitFor(() => expect(hook.result.current.state).toBe('offer'));
    const next = (lifecycleState: HookProps['lifecycleState']): HookProps => ({
      ...initial,
      activeId: 'server-draft',
      lifecycleState,
    });
    hook.rerender(next('saved'));
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).not.toBeNull();
    hook.rerender(next('saving'));
    hook.rerender(next('error'));
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).not.toBeNull();
    hook.rerender(next('saving'));
    hook.rerender(next('saved'));
    await waitFor(() => expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBeNull());
  });

  it('keeps the member intake explicit-only and storage-neutral', () => {
    writeAnonymousDraft(localStorage, snapshot, null, NOW);
    const raw = localStorage.getItem(ANONYMOUS_DRAFT_KEY);
    const spies = ['getItem', 'setItem', 'removeItem'].map(method =>
      vi.spyOn(Storage.prototype, method as 'getItem')
    );
    const props = { freeStartMessages: {}, locale: 'en', tenantId: 'tenant_ks' };
    render(createElement(ClaimDraftIntake, props));
    expect(screen.getByTestId('claim-draft-intake')).toHaveAttribute(
      'data-save-behavior',
      'explicit-only'
    );
    expect(screen.queryByTestId('anonymous-draft-recovery-offer')).not.toBeInTheDocument();
    spies.forEach(spy => expect(spy).not.toHaveBeenCalled());
    vi.restoreAllMocks();
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).toBe(raw);
  });
});
