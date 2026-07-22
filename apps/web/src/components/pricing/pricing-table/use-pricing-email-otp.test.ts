import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePricingEmailOtp } from './use-pricing-email-otp';

const auth = vi.hoisted(() => ({ send: vi.fn(), verify: vi.fn() }));
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    emailOtp: { sendVerificationOtp: auth.send },
    signIn: { emailOtp: auth.verify },
  },
}));

const successSend = { data: { success: true }, error: null };
const successVerify = { data: { user: { id: 'user-1' } }, error: null };

function setup(overrides: Record<string, unknown> = {}) {
  const onVerified = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(() =>
    usePricingEmailOtp({
      initialEmail: ' MEMBER@example.com ',
      locale: 'sr',
      tenantId: 'tenant_ks',
      onVerified,
      ...overrides,
    })
  );
  const emailInput = document.createElement('input');
  const codeInput = document.createElement('input');
  document.body.append(emailInput, codeInput);
  hook.result.current.emailRef.current = emailInput;
  hook.result.current.codeRef.current = codeInput;
  return { ...hook, emailInput, codeInput, onVerified };
}

describe('usePricingEmailOtp recovery boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.send.mockResolvedValue(successSend);
    auth.verify.mockResolvedValue(successVerify);
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('normalizes one deliberate send, allowlists its locale header, and locks duplicates', async () => {
    let release!: (value: typeof successSend) => void;
    auth.send.mockReturnValue(new Promise(resolve => (release = resolve)));
    const { result } = setup();

    await act(async () => {
      const first = result.current.send();
      const duplicate = result.current.send();
      release(successSend);
      await Promise.all([first, duplicate]);
    });

    expect(auth.send).toHaveBeenCalledOnce();
    expect(auth.send).toHaveBeenCalledWith(
      { email: 'member@example.com', type: 'sign-in' },
      { headers: { 'x-interdomestik-locale': 'sr' } }
    );
    expect(result.current.destinationLocked).toBe(true);
  });

  it('focuses code after send, cools down for 60 seconds, and does not steal resend focus', async () => {
    vi.useFakeTimers();
    const { result, codeInput } = setup();
    await act(async () => result.current.send());
    expect(codeInput).toHaveFocus();
    expect(result.current.cooldownSeconds).toBe(60);

    act(() => vi.advanceTimersByTime(60_000));
    const anchor = document.createElement('button');
    document.body.append(anchor);
    anchor.focus();
    await act(async () => result.current.send());

    expect(auth.send).toHaveBeenCalledTimes(2);
    expect(anchor).toHaveFocus();
    act(() => vi.advanceTimersByTime(60_000));
    auth.send.mockRejectedValueOnce(new Error('RAW_RESEND_DETAIL'));
    await act(async () => result.current.send());
    expect(result.current).toMatchObject({ error: 'sendFailed', status: null });
  });

  it('keeps provider details generic and restores focus while changing email clears local state', async () => {
    const { result, emailInput, codeInput } = setup({ initialEmail: '' });
    await act(async () => result.current.send());
    expect(result.current.error).toBe('missingEmail');
    expect(emailInput).toHaveFocus();

    act(() => result.current.setEmail('member@example.com'));
    auth.send.mockRejectedValueOnce(new Error('RAW_PROVIDER_DETAIL'));
    await act(async () => result.current.send());
    expect(result.current.error).toBe('sendFailed');
    auth.send.mockResolvedValueOnce(successSend);
    await act(async () => result.current.send());
    act(() => result.current.setCode('000000'));
    auth.verify.mockResolvedValueOnce({ data: null, error: { message: 'ACCOUNT_EXISTS' } });
    await act(async () => result.current.verify());
    expect(result.current.error).toBe('verify');
    expect(codeInput).toHaveFocus();

    await act(async () => result.current.changeEmail());
    expect(result.current).toMatchObject({
      email: '',
      code: '',
      error: null,
      destinationLocked: false,
    });
    expect(emailInput).toHaveFocus();
    act(() => result.current.setEmail('member@example.com'));
    await act(async () => result.current.send());
    expect(auth.send).toHaveBeenCalledTimes(2);
  });

  it('continues once with the deferred onboarding selector and stops generically on failure', async () => {
    const onVerified = vi.fn().mockRejectedValue(new Error('PRIVATE_CHECKOUT_DETAIL'));
    const { result } = setup({ onVerified });
    await act(async () => result.current.send());
    act(() => result.current.setCode('123456'));
    await act(async () => result.current.verify());
    await act(async () => result.current.verify());

    expect(auth.verify).toHaveBeenCalledOnce();
    expect(auth.verify).toHaveBeenCalledWith({
      email: 'member@example.com',
      otp: '123456',
      onboarding: { tenant: 'tenant_ks', mode: 'deferred' },
    });
    expect(onVerified).toHaveBeenCalledOnce();
    expect(result.current.error).toBe('accountStop');
    expect(result.current.status).toBeNull();
  });
});
