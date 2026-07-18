import { act, render, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteDraftConfirmation } from './delete-draft-confirmation';
import type { CategoryId, DraftState, SavedDraft } from './types';
import { useDraftLifecycle } from './use-draft-lifecycle';
import { useNeutralEmailOtp } from '@/components/auth/use-neutral-email-otp';
// prettier-ignore
const actions = vi.hoisted(() => ({ create: vi.fn(), delete: vi.fn(), list: vi.fn(), resume: vi.fn(), update: vi.fn() }));
const auth = vi.hoisted(() => ({ send: vi.fn(), verify: vi.fn() }));
vi.mock('@/actions/free-start-drafts', () => ({
  createFreeStartDraft: actions.create,
  deleteFreeStartDraft: actions.delete,
  listFreeStartDrafts: actions.list,
  resumeFreeStartDraft: actions.resume,
  updateFreeStartDraft: actions.update,
}));
vi.mock('@/lib/auth-client', () => ({
  authClient: { emailOtp: { sendVerificationOtp: auth.send }, signIn: { emailOtp: auth.verify } },
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => {
    const t = ((key: string) => key) as ((key: string) => string) & {
      raw: () => string;
    };
    t.raw = () =>
      JSON.stringify({
        delete: {
          body: 'Saved {date}; deletion is permanent.',
          cancel: 'Keep draft',
          confirm: 'Delete permanently',
          heading: 'Permanently delete this draft?',
        },
      });
    return t;
  },
}));
// prettier-ignore
const draft: DraftState = { counterparty: 'Insurer', desiredOutcome: 'repair', incidentDate: '2026-03-01', issueType: 'water_damage', summary: 'Water damaged two rooms.' };
// prettier-ignore
const saved: SavedDraft = { ...draft, category: 'property', clientRequestId: '11111111-1111-4111-8111-111111111111', createdAt: '2026-07-18T02:00:00.000Z', id: '22222222-2222-4222-8222-222222222222', resumeStep: 'preview', updatedAt: '2026-07-18T02:00:00.000Z', version: 1 };
function setup() {
  const [onReset, onResume] = [vi.fn(), vi.fn()];
  // prettier-ignore
  const hook = renderHook(props => useDraftLifecycle({ ...props, onReset, onResume }), { initialProps: { category: 'property' as CategoryId | null, draft, step: 'preview' as const } });
  return { ...hook, onReset, onResume };
}
describe('secure Free Start lifecycle', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    actions.create.mockResolvedValue({ ok: true, draft: saved, idempotent: false });
    actions.update.mockResolvedValue({ ok: true, draft: { ...saved, version: 2 } });
    actions.delete.mockResolvedValue({ ok: true, id: saved.id, version: 1 });
    actions.list.mockResolvedValue({ ok: true, items: [saved], nextCursor: null });
    auth.send.mockResolvedValue({ data: {}, error: null });
    auth.verify.mockResolvedValue({ data: { user: { id: 'stable-user' } }, error: null });
  });
  it('C25 retries a verified save intent without consuming the OTP twice', async () => {
    actions.create
      .mockResolvedValueOnce({ ok: false, code: 'authRequired' })
      .mockResolvedValueOnce({ ok: false, code: 'unavailableAccountContext' })
      .mockResolvedValueOnce({ ok: true, draft: saved, idempotent: false });
    const lifecycle = setup();
    await act(() => lifecycle.result.current.openSave());
    // prettier-ignore
    const { result } = renderHook(() => useNeutralEmailOtp({ locale: 'en', onVerified: () => lifecycle.result.current.onVerified(), retryVerifiedIntent: true, tenantId: 'tenant_ks' }));
    act(() => result.current.setEmail('owner@example.com'));
    await act(() => result.current.send());
    act(() => result.current.setCode('123456'));
    await act(() => result.current.verify());
    expect(lifecycle.result.current.state).toBe('accountContext');
    await act(() => result.current.verify());
    expect(auth.verify).toHaveBeenCalledOnce();
    expect(actions.create).toHaveBeenCalledTimes(3);
    expect(lifecycle.result.current.state).toBe('saved');
  });
  it('C26 preserves retry identity and distinguishes rejection, invalid, account and unsupported', async () => {
    // prettier-ignore
    actions.create.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ ok: false, code: 'invalid' }).mockResolvedValueOnce({ ok: false, code: 'unavailableAccountContext' }).mockResolvedValueOnce({ ok: true, draft: { ...saved, summary: 'Corrected facts.' }, idempotent: false });
    const lifecycle = setup();
    const corrected = { ...draft, summary: 'Corrected facts.' };
    for (const expected of ['error', 'invalid', 'accountContext']) {
      await act(() => lifecycle.result.current.openSave());
      expect(lifecycle.result.current.state).toBe(expected);
      if (expected === 'invalid') {
        lifecycle.rerender({ category: 'property', draft: corrected, step: 'preview' });
        await waitFor(() => expect(lifecycle.result.current.state).toBe('idle'));
      }
    }
    expect(new Set(actions.create.mock.calls.map(call => call[0].clientRequestId)).size).toBe(1);
    lifecycle.rerender({ category: 'injury', draft: corrected, step: 'preview' });
    await act(() => lifecycle.result.current.openSave());
    expect(lifecycle.result.current.state).toBe('unsupported');
    lifecycle.rerender({ category: 'property', draft: corrected, step: 'preview' });
    await waitFor(() => expect(lifecycle.result.current.state).toBe('idle'));
    await act(() => lifecycle.result.current.openSave());
    expect(lifecycle.result.current.state).toBe('saved');
  });
  it('C26 saves deliberately, becomes dirty, and fails closed on a CAS conflict', async () => {
    const { result, rerender } = setup();
    await act(() => result.current.openSave());
    expect(result.current.state).toBe('saved');
    // prettier-ignore
    expect(actions.create).toHaveBeenCalledWith(expect.objectContaining({ category: 'property', resumeStep: 'preview' }));
    let releaseList!: () => void;
    // prettier-ignore
    actions.list.mockImplementationOnce(() => new Promise(resolve => (releaseList = () => resolve({ ok: true, items: [saved], nextCursor: null }))));
    let managing!: Promise<unknown>;
    // prettier-ignore
    act(() => { managing = result.current.openManage(); });
    rerender({ category: 'property', draft: { ...draft, summary: 'Changed.' }, step: 'preview' });
    releaseList();
    await act(() => managing);
    expect(result.current.state).toBe('dirty');
    actions.update.mockResolvedValue({ ok: false, code: 'conflict', latestVersion: 2 });
    await act(() => result.current.saveChanges());
    expect(result.current.state).toBe('conflict');
    // prettier-ignore
    expect(actions.update).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 1, id: saved.id, summary: 'Changed.' }));
  });
  it('C27 clears saved identity and rotates the stable create request', async () => {
    const { result, onReset } = setup();
    await act(() => result.current.openSave());
    const firstRequest = actions.create.mock.calls[0][0].clientRequestId;
    act(() => result.current.startAnother());
    await act(() => result.current.openSave());
    expect(actions.create.mock.calls[1][0].clientRequestId).not.toBe(firstRequest);
    expect(result.current.identityKey).toBe(1);
    expect(onReset).toHaveBeenCalledOnce();
  });
  it('C28 focuses confirmation and deletes with id and version only', async () => {
    const { result, rerender } = setup();
    await act(() => result.current.openSave());
    const managedB = { ...saved, id: '33333333-3333-4333-8333-333333333333' };
    // prettier-ignore
    const view = render(<DeleteDraftConfirmation draft={managedB} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(view.getByRole('dialog')).toHaveFocus();
    await act(() => result.current.remove(managedB));
    expect(actions.delete).toHaveBeenCalledWith({ expectedVersion: 1, id: managedB.id });
    expect(result.current.state).toBe('deleted');
    rerender({ category: 'property', draft: { ...draft, summary: 'Changed.' }, step: 'preview' });
    await waitFor(() => expect(result.current.state).toBe('dirty'));
    await act(() => result.current.saveChanges());
    expect(actions.update).toHaveBeenCalledWith(expect.objectContaining({ id: saved.id }));
  });
});
