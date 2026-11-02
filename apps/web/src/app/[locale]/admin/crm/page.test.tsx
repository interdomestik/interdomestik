import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_AUTHORITY, hoisted } from './page.test-support';
import { resetAdminCrmPageMocks } from './page.test-mocks';
import AdminCrmPage from './page';

describe('AdminCrmPage', () => {
  beforeEach(() => {
    resetAdminCrmPageMocks();
  });

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
        authority: TEST_AUTHORITY,
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
      authority: TEST_AUTHORITY,
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
          authority: TEST_AUTHORITY,
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
        authority: TEST_AUTHORITY,
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
});
