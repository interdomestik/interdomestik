import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  headersMock: vi.fn(async () => new Headers()),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  getSessionMock: vi.fn(async () => null),
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@interdomestik/ui/components/button', () => ({
  Button: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('./create-lead-form', () => ({
  CreateLeadForm: () => null,
}));

import NewLeadPage from './_core.entry';

describe('NewLeadPage auth redirect', () => {
  it('redirects unauthenticated users to the locale login path', async () => {
    await expect(
      NewLeadPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).rejects.toThrow('redirect:/en/login');
  });
});
