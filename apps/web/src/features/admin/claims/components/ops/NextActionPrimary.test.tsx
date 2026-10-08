import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NextActionPrimary } from './NextActionPrimary';

const mocks = vi.hoisted(() => ({
  messages: {
    'admin.claims_page.assignment.placeholder': 'Select staff',
    'admin.claims_page.next_actions.title': 'Next action',
    'admin.claims_page.next_actions.no_action': 'No action required',
    'admin.claims_page.next_actions.actions.assign.description': 'Take ownership of this claim',
    'admin.claims_page.next_actions.actions.ack_sla.label': 'Acknowledge Breach',
    'admin.claims_page.next_actions.actions.ack_sla.description': 'Acknowledge the SLA breach',
  } as Record<string, string>,
}));

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace: string) =>
    (key: string): string =>
      mocks.messages[`${namespace}.${key}`] ?? `${namespace}.${key}`,
}));
vi.mock('./StaffAssignmentSelect', () => ({
  StaffAssignmentSelect: () => <div data-testid="staff-assignment-select" />,
}));

function renderPrimary(primary: { type: string } | null, canAssign = true) {
  render(
    <NextActionPrimary
      primary={primary}
      isPending={false}
      canAssign={canAssign}
      staffOptions={[]}
      onAssign={vi.fn()}
      onAction={vi.fn()}
    />
  );
}

describe('NextActionPrimary description', () => {
  it('describes assignment as explicit staff selection, not self-ownership', () => {
    renderPrimary({ type: 'assign' });
    expect(screen.getByText('Select staff')).toBeInTheDocument();
    expect(screen.queryByText('Take ownership of this claim')).not.toBeInTheDocument();
    expect(screen.getByTestId('staff-assignment-select')).toBeInTheDocument();
  });

  it('shows neutral copy and no assignment control when assignment is unavailable', () => {
    renderPrimary({ type: 'assign' }, false);
    expect(screen.getByText('No action required')).toBeInTheDocument();
    expect(screen.queryByText('Select staff')).not.toBeInTheDocument();
    expect(screen.queryByText('Take ownership of this claim')).not.toBeInTheDocument();
    expect(screen.queryByTestId('staff-assignment-select')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps other primary descriptions unchanged', () => {
    renderPrimary({ type: 'ack_sla' });
    expect(screen.getByText('Acknowledge the SLA breach')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acknowledge Breach' })).toBeInTheDocument();
  });

  it('shows the no-action copy without a primary', () => {
    renderPrimary(null);
    expect(screen.getByText('No action required')).toBeInTheDocument();
  });
});
