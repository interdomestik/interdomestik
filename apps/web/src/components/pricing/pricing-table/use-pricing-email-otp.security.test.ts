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

function setup() {
  const onVerified = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(() =>
    usePricingEmailOtp({
      initialEmail: 'member@example.com',
      locale: 'sq',
      tenantId: 'tenant_ks',
      onVerified,
    })
  );
  const codeInput = document.createElement('input');
  document.body.append(codeInput);
  hook.result.current.codeRef.current = codeInput;
  return { ...hook, onVerified };
}

async function reachVerify(result: ReturnType<typeof setup>['result']) {
  await act(async () => result.current.send());
  act(() => result.current.setCode('123456'));
  await act(async () => result.current.verify());
}

describe('IDA-UI03a0b2 Paddle continuation stop', () => {
  beforeEach(() => {
    auth.send.mockReset().mockResolvedValue({ data: { success: true }, error: null });
    auth.verify.mockReset();
  });
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it('C23 maps the protected account-stop response without opening Paddle', async () => {
    auth.verify.mockResolvedValue({
      data: null,
      error: { code: 'ACCOUNT_STOP', message: 'Unable to continue' },
    });
    const { result, onVerified } = setup();
    await reachVerify(result);

    expect(onVerified).not.toHaveBeenCalled();
    expect(result.current.error).toBe('accountStop');
    expect(result.current.status).toBeNull();
  });

  it('C24 refuses a malformed success without an authoritative user id', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    auth.verify.mockResolvedValue({ data: { token: 'token', user: {} }, error: null });
    const { result, onVerified } = setup();
    await reachVerify(result);

    expect(onVerified).not.toHaveBeenCalled();
    expect(result.current.error).toBe('accountStop');
  });
});
