import { installAgentLeadDetailV2PageHooks } from './AgentLeadDetailV2Page.hooks.test-support';
import { describe, expect, it } from 'vitest';
import { hoisted } from './AgentLeadDetailV2Page.test-support';
import { AgentLeadDetailV2Page } from './AgentLeadDetailV2Page';

describe('AgentLeadDetailV2Page tenant contract', () => {
  installAgentLeadDetailV2PageHooks();

  it('rejects a session with missing tenant identity before loading lead details', async () => {
    const session = {
      user: { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: null },
    };
    hoisted.getSessionMock.mockResolvedValue(session);
    hoisted.ensureTenantIdMock.mockImplementationOnce(() => {
      throw new Error('Session missing tenantId. Data integrity issue.');
    });

    await expect(AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' })).rejects.toThrow(
      'Session missing tenantId. Data integrity issue.'
    );

    expect(hoisted.ensureTenantIdMock).toHaveBeenCalledWith(session);
    expect(hoisted.getAgentLeadDetailsCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmLeadActivitiesMock).not.toHaveBeenCalled();
  });

  it('passes actor context into the lead detail and activity read domains', async () => {
    await AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' });

    const actor = {
      actorId: 'agent-1',
      role: 'agent',
      scope: { agentId: 'agent-1', branchId: 'branch-1' },
      tenantId: 'tenant-1',
    };
    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('en');
    expect(hoisted.getAgentLeadDetailsCoreMock).toHaveBeenCalledWith({
      actor,
      authority: expect.any(Object),
      leadId: 'lead-1',
    });
    expect(hoisted.createCrmLeadActivityRepository).toHaveBeenCalledWith(expect.any(Object));
    expect(hoisted.getAgentCrmLeadActivitiesMock).toHaveBeenCalledWith(
      {
        actor,
        leadId: 'lead-1',
      },
      hoisted.crmLeadActivityRepository
    );
    expect(hoisted.listCrmLeadFollowUpTasksForLeadMock).toHaveBeenCalledWith({
      actor,
      authority: expect.any(Object),
      leadId: 'lead-1',
    });
  });

  it('rejects a non-agent or branchless session before loading lead details', async () => {
    hoisted.getSessionMock.mockResolvedValueOnce({
      user: { branchId: null, id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });

    await expect(AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' })).rejects.toThrow(
      'not-found'
    );

    expect(hoisted.notFoundMock).toHaveBeenCalled();
    expect(hoisted.getAgentLeadDetailsCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getAgentCrmLeadActivitiesMock).not.toHaveBeenCalled();
  });

  it('does not load activities when the lead detail core returns not_found', async () => {
    hoisted.getAgentLeadDetailsCoreMock.mockResolvedValueOnce({
      kind: 'not_found',
    });

    await expect(AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' })).rejects.toThrow(
      'not-found'
    );

    expect(hoisted.notFoundMock).toHaveBeenCalled();
    expect(hoisted.getAgentCrmLeadActivitiesMock).not.toHaveBeenCalled();
  });

  it('does not load activities when the lead detail core denies access', async () => {
    hoisted.getAgentLeadDetailsCoreMock.mockRejectedValueOnce(
      new hoisted.AgentLeadDetailsAccessDeniedError('branch_scope')
    );

    await expect(AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' })).rejects.toThrow(
      'not-found'
    );

    expect(hoisted.notFoundMock).toHaveBeenCalled();
    expect(hoisted.getAgentCrmLeadActivitiesMock).not.toHaveBeenCalled();
  });

  it('does not render when the activity domain denies the read after lead authorization', async () => {
    hoisted.getAgentCrmLeadActivitiesMock.mockResolvedValueOnce({
      success: false,
      error: 'forbidden',
      reason: 'branch_scope',
    });

    await expect(AgentLeadDetailV2Page({ id: 'lead-1', locale: 'en' })).rejects.toThrow(
      'not-found'
    );

    expect(hoisted.notFoundMock).toHaveBeenCalled();
  });

  it('preserves the route locale when redirecting unauthenticated sessions to login', async () => {
    hoisted.getSessionMock.mockResolvedValueOnce(null);

    await expect(AgentLeadDetailV2Page({ id: 'lead-1', locale: 'sq' })).rejects.toThrow(
      'redirect:/login:sq'
    );

    expect(hoisted.redirectMock).toHaveBeenCalledWith({ href: '/login', locale: 'sq' });
    expect(hoisted.getAgentLeadDetailsCoreMock).not.toHaveBeenCalled();
  });
});
