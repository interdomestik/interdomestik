import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DailyFocus } from './DailyFocus';

// Mock next-intl and routing
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: any) => {
    if (key === 'followupTitle') return `${values?.count} Follow-ups Overdue`;
    if (key === 'leadsTitle') return `${values?.count} New Leads Assigned`;
    if (key === 'emptyTitle') return "You're all caught up!";
    return key;
  },
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

describe('DailyFocus Component', () => {
  it('prioritizes follow-ups when both follow-ups and new leads exist', () => {
    render(<DailyFocus followUpsCount={5} newLeadsCount={10} />);

    expect(screen.getByText('5 Follow-ups Overdue')).toBeInTheDocument();
    expect(screen.queryByText('10 New Leads Assigned')).not.toBeInTheDocument();
    expect(screen.getByTestId('daily-focus-card-followup')).toBeInTheDocument();
  });

  it('shows new leads when no follow-ups exist', () => {
    render(<DailyFocus followUpsCount={0} newLeadsCount={10} />);

    expect(screen.getByText('10 New Leads Assigned')).toBeInTheDocument();
    expect(screen.getByTestId('daily-focus-card-leads')).toBeInTheDocument();
  });

  it('shows empty state when no follow-ups and no new leads exist', () => {
    render(<DailyFocus followUpsCount={0} newLeadsCount={0} />);

    expect(screen.getByText("You're all caught up!")).toBeInTheDocument();
    expect(screen.getByTestId('daily-focus-card-clear')).toBeInTheDocument();
  });
});
