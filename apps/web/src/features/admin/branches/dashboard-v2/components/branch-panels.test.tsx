import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en/admin-branches.json';
import type { BranchDashboardV2Data } from '../server/branch-dashboard-v2-types';
import { BranchDashboardV2 } from './BranchDashboardV2';

// The global setup mocks next-intl without its provider; these tests render the real provider.
vi.unmock('next-intl');

const copy = messages.admin.branches;
const longName = 'UnbrokenName'.repeat(40);
const data: BranchDashboardV2Data = {
  branch: {
    id: 'branch',
    name: longName,
    code: 'CODE'.repeat(30),
    isActive: true,
    currency: 'EUR',
  },
  health: { score: 50, severity: 'urgent', labelKey: 'health_status_urgent', count: 1 },
  kpis: { openClaims: 31, cashPending: 2, slaBreaches: 1, totalMembers: 40, totalAgents: 2 },
  pipeline: [{ status: 'verification', count: 31 }],
  staffLoad: [
    { id: 'idle', name: 'Idle staff', workload: 0, severity: 'healthy' },
    { id: 'busy', name: longName, workload: 31, severity: 'urgent' },
  ],
  agentHealth: [
    {
      id: 'agent',
      name: longName,
      health: { score: 50, severity: 'urgent', labelKey: 'health_status_urgent', count: 1 },
      metrics: { openClaims: 31, cashPending: 2, slaBreaches: 1 },
    },
  ],
};

function mount(value = data) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BranchDashboardV2 data={value} />
    </NextIntlClientProvider>
  );
}

describe('branch dashboard presentation', () => {
  it('preserves long names, all KPI values, alerts and pipeline content', () => {
    mount();
    expect(screen.getByTestId('branch-dashboard-title')).toHaveTextContent(longName);
    expect(screen.getByTestId('branch-kpi-open-claims')).toHaveTextContent('31');
    expect(screen.getByTestId('branch-kpi-cash-pending')).toHaveTextContent('2');
    expect(screen.getByTestId('branch-kpi-sla-breaches')).toHaveTextContent('1');
    expect(screen.getByTestId('branch-kpi-total-members')).toHaveTextContent('40');
    expect(screen.getByTestId('branch-kpi-total-agents')).toHaveTextContent('2');
    expect(screen.getByText(copy.alerts.sla_breach_title)).toBeInTheDocument();
    expect(screen.getByText(copy.alerts.cash_pending_title)).toBeInTheDocument();
    expect(screen.getByTestId('branch-pipeline-verification')).toHaveTextContent('31');
    expect(screen.getByTestId('branch-kpi-open-claims').parentElement).toHaveClass('grid-cols-1');
  });

  it('keeps each comparison in its own named scroller and retains workload ordering', () => {
    mount();
    const staff = screen.getByRole('region', { name: copy.staff_load.title });
    const agents = screen.getByRole('region', { name: copy.agent_health.title });
    for (const region of [staff, agents]) {
      expect(region).toHaveClass('min-w-0', 'max-w-full', 'overflow-x-auto');
      expect(within(region).getByText(longName)).toBeInTheDocument();
    }
    const rows = within(staff).getAllByRole('row');
    expect(rows[1]).toHaveTextContent(longName);
    expect(rows[2]).toHaveTextContent('Idle staff');
    expect(within(rows[2]).queryByRole('button')).not.toBeInTheDocument();
    expect(
      within(rows[1]).getByRole('button', { name: copy.health.tooltip.urgent.title })
    ).toBeInTheDocument();
    expect(
      within(agents).getByRole('button', { name: copy.health.tooltip.urgent.title })
    ).toBeInTheDocument();
  });

  it('retains explicit empty rows independently of the page error boundary', () => {
    mount({ ...data, staffLoad: [], agentHealth: [], pipeline: [] });
    const staffEmpty = screen.getByText(copy.staff_load.no_staff);
    const agentsEmpty = screen.getByText(copy.agent_health.no_agents);
    expect(staffEmpty).toHaveAttribute('colspan', '2');
    expect(agentsEmpty).toHaveAttribute('colspan', '6');
    expect(screen.getByText(copy.pipeline.empty)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
