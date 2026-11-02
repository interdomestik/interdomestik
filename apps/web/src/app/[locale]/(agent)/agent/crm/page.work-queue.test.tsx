import { installPageHooks } from './page.hooks.test-support';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { hoisted, taskQueueItem } from './page.test-support';
import CRMPage from './page';

describe('CRMPage auth redirect', () => {
  installPageHooks();

  it('renders multi-currency pipeline and source metrics without charts', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });
    hoisted.getAgentCrmReportingCoreMock.mockResolvedValueOnce({
      sourceBreakdown: {
        excludedMissingCurrencyCount: 0,
        excludedMissingValueCount: 0,
        groups: [
          {
            currencyCode: 'EUR',
            dealCount: 2,
            rawValueAmountMinor: 20000,
            source: 'website',
            utmCampaign: null,
            utmMedium: null,
            utmSource: null,
            weightedValueAmountMinor: 12000,
            winRateBps: 5000,
          },
        ],
      },
      weightedPipeline: {
        currencySummaries: [
          {
            closedLostAmountMinor: 1000,
            closedWonAmountMinor: 3000,
            currencyCode: 'EUR',
            forecastBestAmountMinor: 2000,
            forecastCommitAmountMinor: 5000,
            forecastOmittedAmountMinor: 0,
            forecastPipelineAmountMinor: 1000,
            openDealCount: 2,
            rawValueAmountMinor: 20000,
            weightedValueAmountMinor: 8000,
          },
          {
            closedLostAmountMinor: 0,
            closedWonAmountMinor: 0,
            currencyCode: 'USD',
            forecastBestAmountMinor: 0,
            forecastCommitAmountMinor: 0,
            forecastOmittedAmountMinor: 0,
            forecastPipelineAmountMinor: 7000,
            openDealCount: 1,
            rawValueAmountMinor: 10000,
            weightedValueAmountMinor: 7000,
          },
        ],
        excludedRowCount: 2,
      },
      winRateBySource: {
        groups: [
          {
            groupKey: 'website',
            lostCount: 1,
            openCount: 3,
            winRateBps: 5000,
            wonCount: 1,
          },
        ],
      },
      window: {
        from: '2026-02-13T12:00:00.000Z',
        to: '2026-05-14T12:00:00.000Z',
      },
    });

    render(
      await CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    );

    expect(screen.getByTestId('agent-crm-reporting-weighted-pipeline')).toHaveTextContent('EUR');
    expect(screen.getByTestId('agent-crm-reporting-weighted-pipeline')).toHaveTextContent('USD');
    expect(screen.getByTestId('agent-crm-reporting-weighted-pipeline')).toHaveTextContent(
      'reporting.weightedPipeline.excludedRows'
    );
    expect(screen.getByTestId('crm-reporting-chart-pipeline-amount')).toHaveTextContent(
      'reporting.charts.pipelineAmount.title'
    );
    expect(screen.getByTestId('agent-crm-reporting-source-breakdown')).toHaveTextContent('website');
    expect(screen.getByTestId('agent-crm-reporting-win-rate')).toHaveTextContent('website');
  });

  it('renders the task-backed work queue with lifecycle controls only on task rows', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });
    hoisted.getAgentCrmTaskQueueCoreMock.mockResolvedValueOnce([
      taskQueueItem(),
      taskQueueItem({
        dueAt: '2026-05-22T13:00:00.000Z',
        href: '/agent/leads/lead-2',
        leadDisplayRef: { id: 'lead-2', label: 'Lead Two' },
        lifecycleVersion: 4,
        priority: 'normal',
        status: 'in_progress',
        subjectReference: { id: 'lead-2', kind: 'lead' },
        taskId: 'task-2',
      }),
    ]);

    render(
      await CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    );

    const queue = screen.getByTestId('agent-crm-task-queue-ready');
    expect(queue).toHaveTextContent('crm.taskQueue.title');
    expect(queue).toHaveTextContent('Lead One');
    expect(queue).toHaveTextContent('Lead Two');
    expect(queue).toHaveTextContent('crm.taskQueue.labels.follow_up');
    expect(queue).toHaveTextContent('crm.taskQueue.priority.urgent');
    expect(screen.getAllByTestId('agent-crm-task-queue-open')[0]).toHaveAttribute(
      'href',
      '/agent/leads/lead-1'
    );
    expect(screen.getAllByTestId('agent-crm-task-queue-start')).toHaveLength(1);
    expect(screen.getAllByTestId('agent-crm-task-queue-complete')).toHaveLength(2);
    expect(screen.getAllByTestId('agent-crm-task-queue-secondary-toggle')).toHaveLength(2);
    expect(screen.queryByTestId('agent-crm-task-queue-due-edit')).toBeNull();
    expect(screen.queryByTestId('agent-crm-task-queue-cancel')).toBeNull();
    fireEvent.click(screen.getAllByTestId('agent-crm-task-queue-secondary-toggle')[0]);
    expect(screen.getAllByTestId('agent-crm-task-queue-due-edit')).toHaveLength(1);
    expect(screen.getAllByTestId('agent-crm-task-queue-priority-select')).toHaveLength(1);
    expect(screen.getAllByTestId('agent-crm-task-queue-cancel')).toHaveLength(1);
    expect(screen.queryByTestId('agent-lead-complete-follow-up')).toBeNull();
    expect(screen.queryByTestId('agent-lead-schedule-follow-up')).toBeNull();
    expect(screen.queryByTestId('agent-crm-task-queue-due-save')).toBeNull();
    expect(screen.queryByTestId('agent-crm-task-completed-queue-reopen')).toBeNull();
  });

  it('renders recently completed task rows in a separate recovery panel below the open queue', async () => {
    hoisted.getSessionMock.mockResolvedValue({
      user: { branchId: 'branch-1', id: 'agent-1', role: 'agent', tenantId: 'tenant-1' },
    });
    hoisted.getAgentCrmTaskQueueCoreMock.mockResolvedValueOnce([taskQueueItem()]);
    hoisted.getAgentCrmCompletedTaskQueueCoreMock.mockResolvedValueOnce([
      {
        completedAt: '2026-05-22T14:00:00.000Z',
        completionReasonCode: 'resolved',
        dueAt: null,
        href: '/agent/leads/lead-9',
        leadDisplayRef: { id: 'lead-9', label: 'Lead Nine' },
        lifecycleVersion: 8,
        priority: 'normal',
        status: 'completed',
        subjectReference: { id: 'lead-9', kind: 'lead' },
        taskId: 'task-9',
      },
    ]);

    render(
      await CRMPage({
        params: Promise.resolve({ locale: 'en' }),
      })
    );

    const openQueue = screen.getByTestId('agent-crm-task-queue-ready');
    const completedQueue = screen.getByTestId('agent-crm-task-completed-queue-ready');

    expect(openQueue.compareDocumentPosition(completedQueue)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(completedQueue).toHaveTextContent('crm.taskQueue.completed.title');
    expect(completedQueue).toHaveTextContent('Lead Nine');
    expect(completedQueue).toHaveTextContent('crm.taskQueue.status.completed');
    expect(completedQueue).toHaveTextContent('crm.taskQueue.completionReasons.resolved');
    expect(screen.getByTestId('agent-crm-task-completed-queue-open')).toHaveAttribute(
      'href',
      '/agent/leads/lead-9'
    );
    expect(screen.getAllByTestId('agent-crm-task-completed-queue-reopen')).toHaveLength(1);
    expect(screen.getAllByTestId('agent-crm-task-queue-start')).toHaveLength(1);
  });
});
