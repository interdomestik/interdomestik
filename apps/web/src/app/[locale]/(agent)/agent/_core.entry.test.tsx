import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  headersMock: vi.fn(async () => new Headers()),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  getSessionMock: vi.fn(async () => null),
  getAgentTierMock: vi.fn(async () => 'standard'),
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

vi.mock('@/server/auth/effective-portal-access', () => ({
  requireEffectivePortalAccessOrNotFound: vi.fn(),
}));

vi.mock('./_layout.core', () => ({
  getAgentTier: hoisted.getAgentTierMock,
}));

vi.mock('@/features/agent/dashboard/components/AgentDashboardV2Page', () => ({
  AgentDashboardV2Page: () => null,
}));

import AgentDashboardEntry from './_core.entry';

describe('AgentDashboardEntry auth redirect', () => {
  it('redirects unauthenticated users to the locale login path', async () => {
    await expect(
      AgentDashboardEntry({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).rejects.toThrow('redirect:/en/login');
  });
});
