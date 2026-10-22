import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { hoisted } from './page-test-setup';
import AdminCrmPage from './page';

describe('AdminCrmPage', () => {
  it('renders the admin CRM page and all reporting markers for an admin session', async () => {
    const tree = await AdminCrmPage({ params: Promise.resolve({ locale: 'en' }) });

    render(tree);

    expect(hoisted.setRequestLocaleMock).toHaveBeenCalledWith('en');
    expect(hoisted.getAdminCrmReportingCoreMock).toHaveBeenCalledWith(
      {
        actor: {
          actorId: 'admin-1',
          role: 'admin',
          scope: { branchId: null },
          tenantId: 'tenant-1',
        },
      },
      { labels: { noBranch: 'labels.noBranch' } }
    );
    expect(hoisted.getAdminCrmRoutingRulesCoreMock).toHaveBeenCalledWith({
      actor: {
        actorId: 'admin-1',
        role: 'admin',
        scope: { branchId: null },
        tenantId: 'tenant-1',
      },
    });
    expect(screen.getByTestId('admin-crm-page-ready')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-reporting-snapshot')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-reporting-branch-pipeline')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-reporting-source-breakdown')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-forecast-observability-summary')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-forecast-alert-band')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-forecast-alert-status')).toHaveTextContent(
      'forecastAlert.severity.ok'
    );
    expect(screen.getByTestId('admin-crm-forecast-alert-metrics')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-forecast-observability-coverage')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-forecast-observability-batches')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-forecast-backfill-operator-form')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-forecast-backfill-operator-client')).toBeInTheDocument();
    expect(screen.getByTestId('admin-crm-routing-rules-list')).toBeInTheDocument();
    expect(screen.getByTestId('crm-reporting-chart-pipeline-amount')).toHaveTextContent(
      'charts.pipelineAmount.title'
    );
  });

  it.each(['tenant_admin', 'super_admin'])(
    'maps %s sessions to the CRM admin actor',
    async role => {
      hoisted.getSessionSafeMock.mockResolvedValueOnce({
        user: {
          branchId: 'branch-1',
          id: `${role}-1`,
          role,
          tenantId: 'tenant-1',
        },
      });

      const tree = await AdminCrmPage({ params: Promise.resolve({ locale: 'en' }) });

      render(tree);

      expect(hoisted.getAdminCrmReportingCoreMock).toHaveBeenCalledWith(
        {
          actor: {
            actorId: `${role}-1`,
            role: 'admin',
            scope: { branchId: 'branch-1' },
            tenantId: 'tenant-1',
          },
        },
        { labels: { noBranch: 'labels.noBranch' } }
      );
      expect(hoisted.getBranchManagerCrmReportingCoreMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('admin-crm-reporting-branch-pipeline')).toBeInTheDocument();
      expect(screen.getByTestId('admin-crm-routing-rules-list')).toBeInTheDocument();
    }
  );

  it('renders branch-manager scoped CRM reporting without using the admin core', async () => {
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

    expect(hoisted.getAdminCrmReportingCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getAdminCrmRoutingRulesCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getBranchManagerCrmReportingCoreMock).toHaveBeenCalledWith(
      {
        actor: {
          actorId: 'manager-1',
          role: 'branch_manager',
          scope: { branchId: 'branch-1' },
          tenantId: 'tenant-1',
        },
      },
      { branchLabel: 'branch-1' }
    );
    expect(screen.getByTestId('admin-crm-page-ready')).toBeInTheDocument();
    expect(screen.getByTestId('branch-manager-crm-reporting-snapshot')).toBeInTheDocument();
    expect(screen.getByTestId('branch-manager-crm-reporting-branch-pipeline')).toBeInTheDocument();
    expect(screen.getByTestId('branch-manager-crm-reporting-source-breakdown')).toBeInTheDocument();
    expect(
      screen.queryByTestId('admin-crm-forecast-observability-summary')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('admin-crm-forecast-observability-coverage')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('admin-crm-forecast-observability-batches')
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-crm-forecast-alert-band')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-crm-forecast-alert-status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-crm-forecast-alert-metrics')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('admin-crm-forecast-backfill-operator-form')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('admin-crm-forecast-backfill-operator-client')
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-crm-routing-rules-list')).not.toBeInTheDocument();
    expect(screen.getByTestId('crm-reporting-chart-pipeline-amount')).toHaveTextContent(
      'charts.pipelineAmount.title'
    );
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
