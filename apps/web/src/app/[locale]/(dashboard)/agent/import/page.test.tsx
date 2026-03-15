import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { notFound, redirect } from 'next/navigation';

const hoisted = vi.hoisted(() => ({
  getAgentTier: vi.fn(),
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

vi.mock('@/app/[locale]/(agent)/agent/_layout.core', () => ({
  getAgentTier: hoisted.getAgentTier,
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
  it('redirects non-agents to the member portal', async () => {
    hoisted.getSession.mockResolvedValueOnce({ user: { role: 'member' } });

    const redirectMock = vi.mocked(redirect);
    redirectMock.mockImplementationOnce((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(AgentImportPage()).rejects.toThrow('redirect:/member');
  });

  it('hides the page from non-office agents', async () => {
    hoisted.getSession.mockResolvedValueOnce({
      user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });
    hoisted.getAgentTier.mockResolvedValueOnce('pro');

    const notFoundMock = vi.mocked(notFound);
    notFoundMock.mockImplementationOnce(() => {
      throw new Error('notFound');
    });

    await expect(AgentImportPage()).rejects.toThrow('notFound');
  });

  it('renders the aggregate dashboard and uploader for office agents', async () => {
    hoisted.getSession.mockResolvedValueOnce({
      user: { id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });
    hoisted.getAgentTier.mockResolvedValueOnce('office');
    hoisted.getGroupDashboardSummary.mockResolvedValueOnce({
      activatedMembersCount: 7,
      membersUsingBenefitsCount: 3,
      usageRatePercent: 43,
      openClaimsCount: 5,
      sla: { breachCount: 1, incompleteCount: 2, notApplicableCount: 0, runningCount: 3 },
    });

    render(await AgentImportPage());

    expect(screen.getByText('Sponsored Member Import')).toBeInTheDocument();
    expect(screen.getByText('Group summary 7 / 43')).toBeInTheDocument();
    expect(screen.getByText('Mock CSV Uploader')).toBeInTheDocument();
  });
});
