import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANONYMOUS_DRAFT_KEY, writeAnonymousDraft } from './anonymous-draft-recovery';
import { EMPTY_DRAFT } from './constants';
import type { DraftAccount } from './draft-lifecycle-editor';
import type { DraftRestorationLease } from './draft-lifecycle-restoration';
import { FreeStartIntakeShell } from './index';
import {
  account,
  browserCopy,
  context,
  pause,
  renderShellWith,
  resetShell,
  RESUME,
  saved,
  summaryLabel,
} from './tests/account-draft-browser-fixtures';
import type { CategoryId, DraftState, StepId } from './types';
import { useDraftLifecycle } from './use-draft-lifecycle';

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
const restoredProps = {
  category: browserCopy.category,
  draft: browserCopy.draft,
  step: browserCopy.resumeStep,
};

beforeEach(() => resetShell(a));

const renderShell = () => renderShellWith(FreeStartIntakeShell);
/** Another tab saves browser notes, so the shell offers them while account facts exist. */
function offerBrowserCopy() {
  writeAnonymousDraft(localStorage, browserCopy, null);
  const newValue = localStorage.getItem(ANONYMOUS_DRAFT_KEY);
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: ANONYMOUS_DRAFT_KEY, newValue }));
  });
}
type HookProps = Readonly<{
  account: DraftAccount;
  category: CategoryId | null;
  draft: DraftState;
  step: StepId;
}>;
function lifecycle(initial: HookProps) {
  let props = initial;
  const onReset = vi.fn(),
    onResume = vi.fn();
  const hook = renderHook(
    (current: HookProps) => useDraftLifecycle({ ...current, onReset, onResume }),
    { initialProps: props }
  );
  const change = (next: Partial<HookProps>) => {
    props = { ...props, ...next };
    hook.rerender(props);
  };
  return { hook, change, onReset };
}
const vehicleStart: HookProps = {
  account,
  category: 'vehicle',
  draft: EMPTY_DRAFT,
  step: 'details',
};

describe('accepted browser restoration in the verified account shell', () => {
  it('autosaves restored notes as a new source, then updates and exits', async () => {
    writeAnonymousDraft(localStorage, browserCopy, null);
    const view = renderShell();
    await waitFor(() => expect(a.list).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: RESUME }));
    await waitFor(() => expect(a.create).toHaveBeenCalledOnce());
    expect(a.create.mock.calls[0]?.[0]).toMatchObject({
      category: 'property',
      summary: browserCopy.draft.summary,
      expectedContext: context,
    });
    const field = screen.getByLabelText(summaryLabel);
    expect(field).toHaveValue(browserCopy.draft.summary);
    const status = () => screen.getByTestId('account-draft-status');
    await waitFor(() => expect(status()).toHaveAttribute('data-state', 'saved'));
    expect(screen.queryByTestId('free-start-save-otp')).toBeNull();
    fireEvent.change(field, { target: { value: 'Water reached the garage door.' } });
    await waitFor(() => expect(a.update).toHaveBeenCalledOnce());
    expect(a.update.mock.calls[0]?.[0]).toMatchObject({
      id: saved.id,
      expectedVersion: 1,
      category: 'property',
      summary: 'Water reached the garage door.',
    });
    await waitFor(() => expect(status()).toHaveAttribute('data-state', 'saved'));
    fireEvent.change(field, { target: { value: 'Latest garage notes at exit.' } });
    view.unmount();
    await waitFor(() => expect(a.update).toHaveBeenCalledTimes(2));
    expect(a.update.mock.calls[1]?.[0]).toMatchObject({
      id: saved.id,
      expectedVersion: 2,
      summary: 'Latest garage notes at exit.',
    });
    expect(a.create).toHaveBeenCalledOnce();
    expect(a.submit).not.toHaveBeenCalled();
  });
  it('keeps typed facts and the offer when an unknown create refuses retirement', async () => {
    a.create.mockRejectedValueOnce(new Error('response lost'));
    renderShell();
    const field = await screen.findByLabelText(summaryLabel);
    await waitFor(() => expect(a.list).toHaveBeenCalled());
    fireEvent.change(field, { target: { value: 'Typed vehicle facts.' } });
    await waitFor(() =>
      expect(screen.getByTestId('account-draft-status')).toHaveAttribute('data-state', 'error')
    );
    offerBrowserCopy();
    fireEvent.click(await screen.findByRole('button', { name: RESUME }));
    await pause(300);
    expect(field).toHaveValue('Typed vehicle facts.');
    expect(screen.getByRole('button', { name: RESUME })).toBeInTheDocument();
    expect(a.create).toHaveBeenCalledOnce();
    expect(a.update).not.toHaveBeenCalled();
    expect(localStorage.getItem(ANONYMOUS_DRAFT_KEY)).not.toBeNull();
  });
});

type Lifecycle = ReturnType<typeof lifecycle>;
/** A real accepted restoration reset, settled; its lease is that reset's own capability. */
async function startRestoration(h: Lifecycle) {
  const pending = h.hook.result.current.startRestoration();
  await act(async () => {
    await pending;
  });
  return pending;
}
async function restoring() {
  const h = lifecycle(vehicleStart);
  await waitFor(() => expect(a.list).toHaveBeenCalled());
  return { ...h, lease: await startRestoration(h) };
}
const restore = (h: Lifecycle, lease: DraftRestorationLease | null) =>
  lease !== null && h.hook.result.current.completeRestoration(lease, browserCopy);
const unrelated = { category: 'property' as const, draft: { ...EMPTY_DRAFT, summary: 'Other.' } };

describe('browser restoration lease ownership', () => {
  it('admits only its own restored facts, once, never arbitrary facts', async () => {
    const h = await restoring();
    expect(h.onReset).toHaveBeenCalledOnce();
    expect(restore(h, h.lease)).toBe(true);
    expect(restore(h, h.lease)).toBe(false);
    h.change(unrelated);
    await pause(300);
    expect(a.create).not.toHaveBeenCalled();
    h.change(restoredProps);
    await waitFor(() => expect(a.create).toHaveBeenCalledOnce());
    expect(a.create.mock.calls[0]?.[0]).toMatchObject({
      category: 'property',
      summary: browserCopy.draft.summary,
    });
    h.hook.unmount();
  });
  it('completes after an actual empty render without admitting other facts', async () => {
    const h = await restoring();
    h.change({ draft: { ...EMPTY_DRAFT } });
    await pause(300);
    expect(restore(h, h.lease)).toBe(true);
    h.change(unrelated);
    await pause(300);
    expect(a.create).not.toHaveBeenCalled();
    h.change(restoredProps);
    await waitFor(() => expect(a.create).toHaveBeenCalledOnce());
    h.hook.unmount();
  });
  it('completes only the newest accepted reset; an older lease never clears it', async () => {
    const h = await restoring();
    const newer = await startRestoration(h);
    expect(restore(h, h.lease)).toBe(false);
    h.change(restoredProps);
    await pause(300);
    expect(a.create).not.toHaveBeenCalled();
    expect(restore(h, newer)).toBe(true);
    h.change({ draft: { ...browserCopy.draft } });
    await waitFor(() => expect(a.create).toHaveBeenCalledOnce());
    expect(h.onReset).toHaveBeenCalledTimes(2);
    h.hook.unmount();
  });
});
