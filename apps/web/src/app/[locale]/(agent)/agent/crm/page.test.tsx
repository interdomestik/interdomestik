import { installPageHooks } from './page.hooks.test-support';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { hoisted } from './page.test-support';
import CRMPage from './page';

describe('CRMPage auth redirect', () => {
  installPageHooks();

  it('redirects unauthenticated users to the locale login path', async () => {
    await expect(
      CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).rejects.toThrow('redirect:/en/login');
  });

  it('rejects a session with missing tenant identity before loading CRM stats', async () => {
    const session = {
      user: { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: null },
    };
    hoisted.getSessionMock.mockResolvedValue(session);
    hoisted.ensureTenantIdMock.mockImplementationOnce(() => {
      throw new Error('Session missing tenantId. Data integrity issue.');
    });

    await expect(
      CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).rejects.toThrow('Session missing tenantId. Data integrity issue.');

    expect(hoisted.ensureTenantIdMock).toHaveBeenCalledWith(session);
    expect(hoisted.getAgentCrmStatsCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmReportingCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmTaskQueueCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmCompletedTaskQueueCoreMock).not.toHaveBeenCalled();
  });

  it('fails closed for non-agent sessions before loading CRM stats', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { branchId: 'branch-1', id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
    });

    await expect(
      CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).rejects.toThrow('notFound');

    expect(hoisted.notFoundMock).toHaveBeenCalled();
    expect(hoisted.ensureTenantIdMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmStatsCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmReportingCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmTaskQueueCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmCompletedTaskQueueCoreMock).not.toHaveBeenCalled();
  });

  it('fails closed for agent sessions without branch scope before loading CRM stats', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { branchId: null, id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });

    await expect(
      CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).rejects.toThrow('notFound');

    expect(hoisted.notFoundMock).toHaveBeenCalled();
    expect(hoisted.ensureTenantIdMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmStatsCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmReportingCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmTaskQueueCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmCompletedTaskQueueCoreMock).not.toHaveBeenCalled();
  });

  it('passes CRM actor context into the CRM stats and reporting cores on the authorized path', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });

    await CRMPage({
      params: Promise.resolve({ locale: 'en' }),
    });

    expect(hoisted.getAgentCrmStatsCoreMock).toHaveBeenCalledWith({
      actor: {
        actorId: 'agent-1',
        role: 'agent',
        scope: {
          agentId: 'agent-1',
          branchId: 'branch-1',
        },
        tenantId: 'tenant-1',
      },
      authority: expect.any(Object),
    });
    expect(hoisted.getAgentCrmReportingCoreMock).toHaveBeenCalledWith({
      actor: {
        actorId: 'agent-1',
        role: 'agent',
        scope: {
          agentId: 'agent-1',
          branchId: 'branch-1',
        },
        tenantId: 'tenant-1',
      },
      authority: expect.any(Object),
    });
    expect(hoisted.getAgentCrmTaskQueueCoreMock).toHaveBeenCalledWith({
      actor: {
        actorId: 'agent-1',
        role: 'agent',
        scope: {
          agentId: 'agent-1',
          branchId: 'branch-1',
        },
        tenantId: 'tenant-1',
      },
      authority: expect.any(Object),
    });
    expect(hoisted.getAgentCrmCompletedTaskQueueCoreMock).toHaveBeenCalledWith({
      actor: {
        actorId: 'agent-1',
        role: 'agent',
        scope: {
          agentId: 'agent-1',
          branchId: 'branch-1',
        },
        tenantId: 'tenant-1',
      },
      authority: expect.any(Object),
    });
    const authorities = [
      hoisted.getAgentCrmStatsCoreMock,
      hoisted.getAgentCrmReportingCoreMock,
      hoisted.getAgentCrmTaskQueueCoreMock,
      hoisted.getAgentCrmCompletedTaskQueueCoreMock,
    ].map(core => core.mock.calls[0][0].authority);
    for (const authority of authorities) expect(authority).toBe(authorities[0]);
  });

  it('fails closed when the CRM stats core denies dashboard access', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });
    hoisted.getAgentCrmStatsCoreMock.mockRejectedValueOnce(
      new hoisted.AgentCrmStatsAccessDeniedError('branch_scope')
    );

    await expect(
      CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).rejects.toThrow('notFound');

    expect(hoisted.notFoundMock).toHaveBeenCalled();
  });

  it('fails closed when the CRM reporting core denies dashboard access', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });
    hoisted.getAgentCrmReportingCoreMock.mockRejectedValueOnce(
      new hoisted.AgentCrmReportingAccessDeniedError('agent_scope')
    );

    await expect(
      CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).rejects.toThrow('notFound');

    expect(hoisted.notFoundMock).toHaveBeenCalled();
  });

  it('renders CRM12 reporting widget markers and empty states', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });

    render(
      await CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    );

    expect(screen.getByTestId('agent-crm-page-ready')).toBeTruthy();
    expect(screen.getByTestId('agent-crm-task-queue-ready')).toHaveTextContent(
      'crm.taskQueue.empty'
    );
    expect(screen.getByTestId('agent-crm-task-completed-queue-ready')).toHaveTextContent(
      'crm.taskQueue.completed.empty'
    );
    expect(screen.getByTestId('agent-crm-reporting-weighted-pipeline')).toHaveTextContent(
      'reporting.weightedPipeline.empty'
    );
    expect(screen.getByTestId('agent-crm-reporting-source-breakdown')).toHaveTextContent(
      'reporting.sourceBreakdown.empty'
    );
    expect(screen.getByTestId('agent-crm-reporting-win-rate')).toHaveTextContent(
      'reporting.winRate.empty'
    );
  });
});
