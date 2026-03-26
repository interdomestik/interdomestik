import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  headersMock: vi.fn(async () => new Headers()),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  getSessionMock: vi.fn(async () => null),
  ensureTenantIdMock: vi.fn(),
  getAgentLeadsCoreMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
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
  db: {
    query: {
      agentSettings: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  agentSettings: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

vi.mock('@/features/agent/leads/components/AgentLeadsProPage', () => ({
  AgentLeadsProPage: () => null,
}));

vi.mock('./_core', () => ({
  getAgentLeadsCore: hoisted.getAgentLeadsCoreMock,
}));

import AgentLeadsEntry from './_core.entry';

describe('AgentLeadsEntry auth redirect', () => {
  it('redirects unauthenticated users to the locale login path', async () => {
    await expect(
      AgentLeadsEntry({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).rejects.toThrow('redirect:/en/login');
  });
});
