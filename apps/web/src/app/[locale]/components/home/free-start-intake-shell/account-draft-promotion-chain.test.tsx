import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANONYMOUS_DRAFT_KEY,
  readAnonymousDraft,
  writeAnonymousDraft,
} from './anonymous-draft-recovery';
import { FreeStartIntakeShell } from './index';
import {
  browserCopy,
  context,
  drainMicrotasks,
  lockRequests,
  pause,
  renderShellWith,
  resetShell,
  RESUME,
  saved,
  summaryLabel,
} from './tests/account-draft-browser-fixtures';
import { held } from './tests/terminal-draft-fixtures';

vi.unmock('next-intl');
// Routing, session and the recovery band are presentation/session doubles only; the real shell,
// lifecycle hook, recovery queue and native persistence stay unmocked.
vi.mock('@/i18n/routing', () => import('./tests/account-draft-browser-fixtures'));
vi.mock('./anonymous-draft-recovery-band', () => import('./tests/account-draft-browser-fixtures'));
vi.mock('@/lib/auth-client', () => import('./tests/account-draft-browser-fixtures'));
const a = vi.hoisted(() => ({
  account: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
  resume: vi.fn(),
  remove: vi.fn(),
  submit: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock('@/actions/free-start-drafts', () => ({
  getFreeStartDraftAccount: a.account,
  createFreeStartDraft: a.create,
  updateFreeStartDraft: a.update,
  listFreeStartDrafts: a.list,
  resumeFreeStartDraft: a.resume,
  deleteFreeStartDraft: a.remove,
}));
vi.mock('@/actions/claims/create-from-saved-draft', () => ({
  createClaimFromSavedDraft: a.submit,
  lookupSavedDraftClaim: a.lookup,
}));
const NEXT = 'Latest acknowledged garage notes.';
const status = () => screen.getByTestId('account-draft-status');
const stored = () => localStorage.getItem(ANONYMOUS_DRAFT_KEY);

beforeEach(() => resetShell(a));

const renderShell = () => renderShellWith(FreeStartIntakeShell);
/** Another context changed the native browser copy and announces it to this tab. */
function announce() {
  const newValue = stored();
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: ANONYMOUS_DRAFT_KEY, newValue }));
  });
}
const lockCount = () => lockRequests().mock.calls.length;
/** Observes real lock-guarded reads after `seen`, then settles their continuations. */
async function settleReads(seen: number) {
  const requests = lockRequests();
  await waitFor(() => expect(requests.mock.calls.length).toBeGreaterThan(seen));
  async function settleLatest(): Promise<void> {
    const settled = requests.mock.calls.length;
    await act(async () => {
      await requests.mock.results[settled - 1]?.value;
      await drainMicrotasks();
    });
    if (settled !== requests.mock.calls.length) await settleLatest();
  }
  await settleLatest();
}
/**
 * Real shell and real queue: create(A) is held and B is admitted after the quiet window, so the
 * queue chains update(B) on version 1 while React observes one continuous save.
 */
async function chainToB(receipt: Record<string, unknown> = {}) {
  const create = held<void>(),
    update = held<void>();
  a.create.mockImplementationOnce(async () => {
    await create.promise;
    return { ok: true, draft: saved };
  });
  a.update.mockImplementationOnce(async (input: { summary?: string }) => {
    await update.promise;
    return { ok: true, draft: { ...saved, summary: input.summary, version: 2, ...receipt } };
  });
  writeAnonymousDraft(localStorage, browserCopy, null);
  renderShell();
  await waitFor(() => expect(a.list).toHaveBeenCalled());
  fireEvent.click(await screen.findByRole('button', { name: RESUME }));
  await waitFor(() => expect(a.create).toHaveBeenCalledOnce());
  const field = screen.getByLabelText(summaryLabel);
  fireEvent.change(field, { target: { value: NEXT } });
  await pause(300);
  expect(a.update).not.toHaveBeenCalled();
  const before = readAnonymousDraft(localStorage);
  if (before.status !== 'available') throw new Error('missing real initial browser copy');
  // The native copy still holds the restored A facts, never B.
  expect(before.record).toMatchObject({
    category: 'property',
    resumeStep: 'details',
    draft: { summary: browserCopy.draft.summary },
  });
  return { before: before.record, create, field, update };
}
type Chain = Awaited<ReturnType<typeof chainToB>>;
async function releaseCreate(chain: Chain) {
  await act(async () => chain.create.resolve());
  await waitFor(() => expect(a.update).toHaveBeenCalledOnce());
  expect(a.update.mock.calls[0]?.[0]).toMatchObject({
    id: saved.id,
    expectedVersion: 1,
    summary: NEXT,
    expectedContext: context,
  });
  expect(status()).toHaveAttribute('data-state', 'saving');
}
async function releaseUpdate(chain: Chain) {
  await act(async () => chain.update.resolve());
  await waitFor(() => expect(status()).not.toHaveAttribute('data-state', 'saving'));
}
function expectOneChainedSource() {
  expect(a.create).toHaveBeenCalledOnce();
  expect(a.update).toHaveBeenCalledOnce();
  expect(a.remove).not.toHaveBeenCalled();
  expect(a.submit).not.toHaveBeenCalled();
}
function expectNoRecoveryHold() {
  expect(screen.queryByRole('button', { name: RESUME })).toBeNull();
  expect(screen.getByTestId('free-start-recovery-editor')).not.toHaveAttribute('inert');
}

describe('one continuous chained account save and the browser copy', () => {
  it('retires an observed matching copy after the chained B acknowledgement', async () => {
    const chain = await chainToB();
    // Diagnostic setup: another context stored matching B facts; it is not this tab's write.
    const matching = { ...browserCopy, draft: { ...browserCopy.draft, summary: NEXT } };
    expect(writeAnonymousDraft(localStorage, matching, chain.before).status).toBe('saved');
    const seen = lockCount();
    announce();
    await settleReads(seen);
    expect(screen.queryByRole('button', { name: RESUME })).toBeNull();
    await releaseCreate(chain);
    await releaseUpdate(chain);
    await waitFor(() => expect(status()).toHaveAttribute('data-state', 'saved'));
    expect(chain.field).toHaveValue(NEXT);
    expectOneChainedSource();
    await waitFor(() => expect(stored()).toBeNull());
    expectNoRecoveryHold();
  });
  it('retires the retained known A copy once current facts and the server hold B', async () => {
    const chain = await chainToB();
    await releaseCreate(chain);
    await releaseUpdate(chain);
    await waitFor(() => expect(status()).toHaveAttribute('data-state', 'saved'));
    expect(chain.field).toHaveValue(NEXT);
    expectOneChainedSource();
    await waitFor(() => expect(stored()).toBeNull());
    expectNoRecoveryHold();
  });
  it('keeps and offers a foreign copy written while the B acknowledgement is held', async () => {
    const chain = await chainToB();
    await releaseCreate(chain);
    const summary = 'Another tab kept other garage notes.';
    const foreign = { ...browserCopy, draft: { ...browserCopy.draft, summary } };
    expect(writeAnonymousDraft(localStorage, foreign, chain.before).status).toBe('saved');
    const foreignRaw = stored();
    announce();
    expect(await screen.findByRole('button', { name: RESUME })).toBeInTheDocument();
    const seen = lockCount();
    await releaseUpdate(chain);
    await settleReads(seen);
    expectOneChainedSource();
    expect(stored()).toBe(foreignRaw);
    expect(screen.getByRole('button', { name: RESUME })).toBeInTheDocument();
  });
  it('retains the device copy when the final server receipt names other facts', async () => {
    const chain = await chainToB({ summary: 'Server kept different garage notes.' });
    await releaseCreate(chain);
    const seen = lockCount();
    await releaseUpdate(chain);
    await settleReads(seen);
    expect(a.create).toHaveBeenCalledOnce();
    expect(a.remove).not.toHaveBeenCalled();
    expect(a.submit).not.toHaveBeenCalled();
    expect(readAnonymousDraft(localStorage).status).toBe('available');
  });
  it('keeps a foreign copy learned during a temporary matching edit after returning to B', async () => {
    const chain = await chainToB();
    await releaseCreate(chain);
    const summary = 'Another tab kept temporary matching facts.';
    expect(screen.getByTestId('free-start-recovery-editor')).not.toHaveAttribute('inert');
    fireEvent.change(chain.field, { target: { value: summary } });
    const foreign = { ...browserCopy, draft: { ...browserCopy.draft, summary } };
    expect(writeAnonymousDraft(localStorage, foreign, chain.before).status).toBe('saved');
    const foreignRaw = stored();
    await act(async () => {
      announce();
      await drainMicrotasks();
    });
    expect(chain.field).toHaveValue(summary);
    expect(screen.queryByRole('button', { name: RESUME })).toBeNull();
    expect(screen.getByTestId('free-start-recovery-editor')).not.toHaveAttribute('inert');
    fireEvent.change(chain.field, { target: { value: NEXT } });
    await pause(300);
    expect(a.update).toHaveBeenCalledOnce();
    await releaseUpdate(chain);
    await waitFor(() => expect(status()).toHaveAttribute('data-state', 'saved'));
    expect(chain.field).toHaveValue(NEXT);
    expectOneChainedSource();
    expect(stored()).toBe(foreignRaw);
    await waitFor(() => expect(screen.getByRole('button', { name: RESUME })).toBeInTheDocument());
  });
});
