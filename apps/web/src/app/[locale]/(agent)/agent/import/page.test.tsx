import { render, screen } from '@testing-library/react';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it, vi } from 'vitest';

import { notFound, redirect } from 'next/navigation';

const hoisted = vi.hoisted(() => ({
  authorizeSessionTenant: vi.fn(),
  resolveSponsoredImportAccess: vi.fn(),
  getGroupDashboardSummary: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSession,
    },
  },
}));

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: hoisted.authorizeSessionTenant,
}));

vi.mock('@/lib/actions/agent/sponsored-import-access', () => ({
  resolveSponsoredImportAccess: hoisted.resolveSponsoredImportAccess,
}));

vi.mock('@/features/agent/import/server/get-group-dashboard-summary', () => ({
  getGroupDashboardSummary: hoisted.getGroupDashboardSummary,
}));

vi.mock('@/features/agent/import/components/csv-uploader', () => ({
  CSVUploader: () => <div>Mock CSV Uploader</div>,
}));

vi.mock('@/features/agent/import/components/group-dashboard-summary', () => ({
  GroupDashboardSummary: ({
    summary,
  }: {
    summary: { activatedMembersCount: number; usageRatePercent: number };
  }) => (
    <div>
      Group summary {summary.activatedMembersCount} / {summary.usageRatePercent}
    </div>
  ),
}));

import AgentImportPage from './page';

describe('AgentImportPage', () => {
  const params = Promise.resolve({ locale: 'sq' });

  it('redirects non-agents to the member portal', async () => {
    hoisted.getSession.mockResolvedValueOnce({ user: { role: 'member' } });

    const redirectMock = vi.mocked(redirect);
    redirectMock.mockImplementationOnce((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(AgentImportPage({ params })).rejects.toThrow('redirect:/sq/member');
  });

  it.each(['not_office', 'dark'])('hides the page when access is %s', async access => {
    const session = { user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' } };
    hoisted.getSession.mockResolvedValueOnce(session);
    hoisted.authorizeSessionTenant.mockResolvedValueOnce({
      session,
      authority: mintTestTenantAuthority('tenant-1'),
    });
    hoisted.resolveSponsoredImportAccess.mockResolvedValueOnce(access);

    const notFoundMock = vi.mocked(notFound);
    notFoundMock.mockImplementationOnce(() => {
      throw new Error('notFound');
    });

    await expect(AgentImportPage({ params })).rejects.toThrow('notFound');
  });

  it('renders the aggregate dashboard and uploader for office agents', async () => {
    const session = { user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' } };
    const authority = mintTestTenantAuthority('tenant-1');
    hoisted.getSession.mockResolvedValueOnce(session);
    hoisted.authorizeSessionTenant.mockResolvedValueOnce({ session, authority });
    hoisted.resolveSponsoredImportAccess.mockResolvedValueOnce('allowed');
    hoisted.getGroupDashboardSummary.mockResolvedValueOnce({
      activatedMembersCount: 7,
      membersUsingBenefitsCount: 3,
      usageRatePercent: 43,
      openClaimsCount: 5,
      sla: { breachCount: 1, incompleteCount: 2, notApplicableCount: 0, runningCount: 3 },
    });

    render(await AgentImportPage({ params }));

    expect(screen.getByText('Sponsored Member Import')).toBeInTheDocument();
    expect(screen.getByText('Group summary 7 / 43')).toBeInTheDocument();
    expect(screen.getByText('Mock CSV Uploader')).toBeInTheDocument();
    expect(hoisted.resolveSponsoredImportAccess).toHaveBeenCalledWith({
      agentId: 'agent-1',
      authority,
    });
    expect(hoisted.getGroupDashboardSummary).toHaveBeenCalledWith({
      agentId: 'agent-1',
      authority,
    });
  });
});
