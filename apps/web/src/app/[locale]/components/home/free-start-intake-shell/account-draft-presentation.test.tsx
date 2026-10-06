import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAccountDraftPresentation } from './use-account-draft-presentation';
const account = vi.hoisted(() => vi.fn());
vi.mock('@/actions/free-start-drafts', () => ({ getFreeStartDraftAccount: account }));
const a = { ownerUserId: 'owner-a', tenantId: 'tenant_ks' };
const b = { ...a, ownerUserId: 'owner-b' };
beforeEach(() => vi.resetAllMocks());
describe('fresh account presentation', () => {
  it('keeps anonymous rendering synchronous without starting a server auth lookup', () => {
    const hook = renderHook(() => useAccountDraftPresentation(null));
    expect(hook.result.current).toBeNull();
    expect(account).not.toHaveBeenCalled();
  });
  it('pins a known unverified owner before the server settles', async () => {
    account.mockReturnValue(new Promise(() => {}));
    const hook = renderHook(() => useAccountDraftPresentation(a));
    expect(hook.result.current).toEqual({ emailVerified: false, expectedContext: a });
  });
  it.each([false, undefined, 'true'])(
    'does not enable saves for a %s verification verdict',
    async emailVerified => {
      account.mockResolvedValue({ ok: true, expectedContext: a, emailVerified });
      const hook = renderHook(() => useAccountDraftPresentation(a));
      await act(async () => {});
      expect(hook.result.current?.emailVerified).toBe(false);
    }
  );
  it('admits the exact server-confirmed owner without a membership predicate', async () => {
    account.mockResolvedValue({ ok: true, expectedContext: a, emailVerified: true });
    const hook = renderHook(() => useAccountDraftPresentation(a));
    await waitFor(() => expect(hook.result.current?.emailVerified).toBe(true));
  });
  it('rejects a different server owner even before the client account rerenders', async () => {
    account.mockResolvedValue({ ok: true, expectedContext: b, emailVerified: true });
    const hook = renderHook(() => useAccountDraftPresentation(a));
    await act(async () => {});
    expect(hook.result.current).toEqual({ emailVerified: false, expectedContext: a });
  });
  it('ignores the late A verdict after switching to B and after logout', async () => {
    let settle!: (value: unknown) => void;
    account
      .mockReturnValueOnce(
        new Promise(done => {
          settle = done;
        })
      )
      .mockResolvedValue({ ok: true, expectedContext: b, emailVerified: false });
    const hook = renderHook(hint => useAccountDraftPresentation(hint), {
      initialProps: a as typeof a | null,
    });
    hook.rerender(b);
    await act(async () => {
      settle({ ok: true, expectedContext: a, emailVerified: true });
    });
    expect(hook.result.current).toEqual({ emailVerified: false, expectedContext: b });
    hook.rerender(null);
    expect(hook.result.current).toBeNull();
  });
});
