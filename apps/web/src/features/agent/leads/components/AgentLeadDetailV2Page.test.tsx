import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  headersMock: vi.fn(async () => new Headers()),
  redirectMock: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
  notFoundMock: vi.fn(() => {
    throw new Error('not-found');
  }),
  getTranslationsMock: vi.fn(async () => (key: string) => key),
  getSessionMock: vi.fn(),
  ensureTenantIdMock: vi.fn(() => 'tenant-1'),
  getAgentLeadDetailsCoreMock: vi.fn(),
  getLeadActivitiesMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersMock,
}));

vi.mock('next/navigation', () => ({
  notFound: hoisted.notFoundMock,
  redirect: hoisted.redirectMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: hoisted.getTranslationsMock,
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

vi.mock('@/actions/activities', () => ({
  getLeadActivities: hoisted.getLeadActivitiesMock,
}));

vi.mock('@/app/[locale]/(agent)/agent/leads/[id]/_core', () => ({
  getAgentLeadDetailsCore: hoisted.getAgentLeadDetailsCoreMock,
}));

vi.mock('@/components/crm/activity-feed', () => ({
  ActivityFeed: () => null,
}));

vi.mock('@/components/crm/log-activity-dialog', () => ({
  LogActivityDialog: () => null,
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@interdomestik/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => children,
  Card: ({ children }: { children: ReactNode }) => children,
  CardContent: ({ children }: { children: ReactNode }) => children,
  CardHeader: ({ children }: { children: ReactNode }) => children,
  CardTitle: ({ children }: { children: ReactNode }) => children,
}));

import { AgentLeadDetailV2Page } from './AgentLeadDetailV2Page';

describe('AgentLeadDetailV2Page tenant contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSessionMock.mockResolvedValue({
      user: { id: 'agent-1', tenantId: 'tenant-1' },
    });
    hoisted.ensureTenantIdMock.mockReturnValue('tenant-1');
    hoisted.getAgentLeadDetailsCoreMock.mockResolvedValue({
      kind: 'ok',
      lead: { id: 'lead-1', agentId: 'agent-1', fullName: 'Lead', stage: 'new' },
      deals: [],
    });
    hoisted.getLeadActivitiesMock.mockResolvedValue([]);
  });

  it('rejects a session with missing tenant identity before loading lead details', async () => {
    const session = { user: { id: 'agent-1', tenantId: null } };
    hoisted.getSessionMock.mockResolvedValue(session);
    hoisted.ensureTenantIdMock.mockImplementationOnce(() => {
      throw new Error('Session missing tenantId. Data integrity issue.');
    });

    await expect(AgentLeadDetailV2Page({ id: 'lead-1' })).rejects.toThrow(
      'Session missing tenantId. Data integrity issue.'
    );

    expect(hoisted.ensureTenantIdMock).toHaveBeenCalledWith(session);
    expect(hoisted.getAgentLeadDetailsCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getLeadActivitiesMock).not.toHaveBeenCalled();
  });

  it('passes tenant identity into the lead detail core before loading activities', async () => {
    await AgentLeadDetailV2Page({ id: 'lead-1' });

    expect(hoisted.getAgentLeadDetailsCoreMock).toHaveBeenCalledWith({
      leadId: 'lead-1',
      tenantId: 'tenant-1',
      viewerAgentId: 'agent-1',
    });
    expect(hoisted.getLeadActivitiesMock).toHaveBeenCalledWith('lead-1');
  });

  it('does not load activities when the lead detail core redirects', async () => {
    hoisted.getAgentLeadDetailsCoreMock.mockResolvedValueOnce({
      kind: 'redirect',
      href: '/agent/leads',
    });

    await expect(AgentLeadDetailV2Page({ id: 'lead-1' })).rejects.toThrow('redirect:/agent/leads');

    expect(hoisted.getLeadActivitiesMock).not.toHaveBeenCalled();
  });
});
