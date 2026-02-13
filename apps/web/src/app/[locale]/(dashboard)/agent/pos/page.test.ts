import { describe, expect, it, vi } from 'vitest';

import { redirect } from 'next/navigation';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSession,
    },
  },
}));

import AgentPOSPage from './page';

describe('AgentPOSPage', () => {
  it('redirects agents to canonical enrollment with locale + mode', async () => {
    hoisted.getSession.mockResolvedValueOnce({ user: { role: 'agent' } });

    const redirectMock = vi.mocked(redirect);
    redirectMock.mockImplementationOnce((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(AgentPOSPage({ params: Promise.resolve({ locale: 'sq' }) })).rejects.toThrow(
      'redirect:/sq/agent/clients/new?mode=pos'
    );
  });

  it('redirects non-agents to member portal with locale', async () => {
    hoisted.getSession.mockResolvedValueOnce({ user: { role: 'member' } });

    const redirectMock = vi.mocked(redirect);
    redirectMock.mockImplementationOnce((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(AgentPOSPage({ params: Promise.resolve({ locale: 'sq' }) })).rejects.toThrow(
      'redirect:/sq/member'
    );
  });
});
