import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  headersMock: vi.fn(async () => new Headers()),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  getSessionMock: vi.fn(async () => null),
  ensureTenantIdMock: vi.fn(),
  getAgentWorkspaceClaimsCoreMock: vi.fn(),
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

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: hoisted.ensureTenantIdMock,
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {},
}));

vi.mock('@/features/agent/claims/components/AgentClaimsProPage', () => ({
  AgentClaimsProPage: () => null,
}));

vi.mock('./_core', () => ({
  getAgentWorkspaceClaimsCore: hoisted.getAgentWorkspaceClaimsCoreMock,
}));

import AgentWorkspaceClaimsPage from './page';

describe('AgentWorkspaceClaimsPage auth redirect', () => {
  it('redirects unauthenticated users to the locale login path', async () => {
    await expect(
      AgentWorkspaceClaimsPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow('redirect:/en/login');
  });
});
