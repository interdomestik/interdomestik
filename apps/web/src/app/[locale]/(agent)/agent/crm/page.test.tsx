import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  headersMock: vi.fn(async () => new Headers()),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  getSessionMock: vi.fn(async () => null),
  getTranslationsMock: vi.fn(async () => (key: string) => key),
  setRequestLocaleMock: vi.fn(),
  getAgentCrmStatsCoreMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: hoisted.getTranslationsMock,
  setRequestLocale: hoisted.setRequestLocaleMock,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSessionMock,
    },
  },
}));

vi.mock('./_core', () => ({
  getAgentCrmStatsCore: hoisted.getAgentCrmStatsCoreMock,
}));

vi.mock('@/components/agent/leaderboard-card', () => ({
  LeaderboardCard: () => null,
}));

vi.mock('@/components/agent/pipeline-chart', () => ({
  PipelineChart: () => null,
}));

import CRMPage from './page';

describe('CRMPage auth redirect', () => {
  it('redirects unauthenticated users to the locale login path', async () => {
    await expect(
      CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).rejects.toThrow('redirect:/en/login');
  });
});
