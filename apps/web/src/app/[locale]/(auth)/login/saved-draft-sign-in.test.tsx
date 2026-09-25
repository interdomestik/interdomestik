import { render } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { SavedDraftSignInEntry } from './saved-draft-sign-in';

const h = vi.hoisted(() => ({ host: 'ida.localhost', forwarded: '', child: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: h.host, 'x-forwarded-host': h.forwarded }),
}));
vi.mock('next-intl/server', () => ({ getMessages: async () => ({ freeStart: {} }) }));
vi.mock('next-intl', () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/lib/tenant/tenant-hosts', () => ({ resolveDefaultPublicTenantId: () => 'tenant_ks' }));
vi.mock('@/components/auth/saved-draft-sign-in', () => ({
  SavedDraftSignIn: (props: unknown) => {
    h.child(props);
    return null;
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  h.host = 'ida.localhost';
  h.forwarded = '';
});
it('uses only the server default tenant on the validated neutral host', async () => {
  render(await SavedDraftSignInEntry({ locale: 'sq' }));
  expect(h.child).toHaveBeenCalledWith({ locale: 'sq', tenantId: 'tenant_ks' });
});
it.each(['ks.localhost', 'untrusted.invalid'])('omits OTP recovery on %s', async host => {
  h.host = host;
  expect(await SavedDraftSignInEntry({ locale: 'en' })).toBeNull();
  expect(h.child).not.toHaveBeenCalled();
});
it('fails closed for conflicting host headers', async () => {
  h.forwarded = 'ks.localhost';
  expect(await SavedDraftSignInEntry({ locale: 'en' })).toBeNull();
});
