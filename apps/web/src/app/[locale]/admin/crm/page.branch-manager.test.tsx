import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { hoisted } from './page.test-support';
import { resetAdminCrmPageMocks } from './page.test-mocks';
import AdminCrmPage from './page';

describe('AdminCrmPage', () => {
  beforeEach(() => {
    resetAdminCrmPageMocks();
  });

  it('omits the branch-manager pipeline chart when scoped pipeline rows are empty', async () => {
    hoisted.getSessionSafeMock.mockResolvedValueOnce({
      user: {
        branchId: 'branch-1',
        id: 'manager-1',
        role: 'branch_manager',
        tenantId: 'tenant-1',
      },
    });
    hoisted.getBranchManagerCrmReportingCoreMock.mockResolvedValueOnce({
      branchLabel: 'branch-1',
      branchPipeline: {
        excludedRowCount: 0,
        rows: [],
        state: 'empty',
      },
      generatedAt: '2026-05-14T12:00:00.000Z',
      snapshot: {
        excludedRowCount: 0,
        rows: [
          {
            branchId: 'branch-1',
            branchLabel: 'branch-1',
            closedLostAmountMinor: 0,
            closedWonAmountMinor: 0,
            currencyCode: 'EUR',
            freshness: 'fresh',
            openDealCount: 2,
            pipelineId: 'pipeline-1',
            pipelineLabel: 'pipeline-1',
            snapshotDate: '2026-05-13',
            snapshotVersion: 1,
            totalPipelineAmountMinor: 10000,
            weightedPipelineAmountMinor: 8000,
          },
        ],
        state: 'data',
      },
      snapshotDate: '2026-05-13',
      sourceBreakdown: {
        excludedRowCount: 0,
        rows: [],
        state: 'empty',
      },
      window: {
        from: '2026-02-13T12:00:00.000Z',
        to: '2026-05-14T12:00:00.000Z',
      },
    });

    const tree = await AdminCrmPage({ params: Promise.resolve({ locale: 'en' }) });

    render(tree);

    expect(screen.getByTestId('branch-manager-crm-reporting-branch-pipeline')).toBeInTheDocument();
    expect(screen.queryByTestId('crm-reporting-chart-pipeline-amount')).not.toBeInTheDocument();
  });

  it('keeps branch-manager rendered labels aggregate-only', async () => {
    hoisted.getSessionSafeMock.mockResolvedValueOnce({
      user: {
        branchId: 'branch-1',
        id: 'manager-1',
        role: 'branch_manager',
        tenantId: 'tenant-1',
      },
    });

    const tree = await AdminCrmPage({ params: Promise.resolve({ locale: 'en' }) });

    render(tree);

    const renderedText = document.body.textContent ?? '';
    expect(renderedText).toContain('branch-1');
    expect(renderedText).toContain('pipeline-1');
    expect(renderedText).toContain('website');
    for (const forbidden of [
      'alice@example.com',
      '+15555550123',
      'Alice Member',
      'private member note',
      'member deal name',
    ]) {
      expect(renderedText).not.toContain(forbidden);
    }
  });

  it('fails closed for branch-manager sessions without branch scope before actor construction', async () => {
    hoisted.getSessionSafeMock.mockResolvedValueOnce({
      user: {
        branchId: null,
        id: 'manager-1',
        role: 'branch_manager',
        tenantId: 'tenant-1',
      },
    });

    await expect(AdminCrmPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow(
      'notFound'
    );

    expect(hoisted.getAdminCrmReportingCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getBranchManagerCrmReportingCoreMock).not.toHaveBeenCalled();
  });

  it('fails closed for admin-like sessions without a tenant before loading reporting data', async () => {
    hoisted.getSessionSafeMock.mockResolvedValueOnce({
      user: {
        branchId: null,
        id: 'admin-1',
        role: 'admin',
        tenantId: null,
      },
    });

    await expect(AdminCrmPage({ params: Promise.resolve({ locale: 'en' }) })).rejects.toThrow(
      'notFound'
    );

    expect(hoisted.getAdminCrmReportingCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getBranchManagerCrmReportingCoreMock).not.toHaveBeenCalled();
  });
});
