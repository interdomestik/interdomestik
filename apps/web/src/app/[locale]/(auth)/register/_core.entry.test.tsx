import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  registerFormMock: vi.fn(() => <div>register-form</div>),
  setRequestLocaleMock: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
}));

vi.mock('@/components/auth/register-form', () => ({
  RegisterForm: () => hoisted.registerFormMock(),
}));

import RegisterPage from './_core.entry';

describe('RegisterPage redirect', () => {
  it('redirects the public register route to the pricing entry', async () => {
    hoisted.redirectMock.mockImplementationOnce((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(
      RegisterPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow('redirect:/en/pricing');

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('en');
    expect(hoisted.redirectMock).toHaveBeenCalledWith('/en/pricing');
    expect(hoisted.registerFormMock).not.toHaveBeenCalled();
  });

  it('preserves plan selection and tenant attribution on the pricing redirect', async () => {
    hoisted.redirectMock.mockImplementationOnce((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(
      RegisterPage({
        params: Promise.resolve({ locale: 'mk' }),
        searchParams: Promise.resolve({ tenantId: 'tenant_mk', plan: 'standard' }),
      })
    ).rejects.toThrow('redirect:/mk/pricing?plan=standard&tenantId=tenant_mk');

    expect(hoisted.redirectMock).toHaveBeenCalledWith(
      '/mk/pricing?plan=standard&tenantId=tenant_mk'
    );
  });
});
