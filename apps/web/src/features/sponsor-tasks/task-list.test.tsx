import type { SponsorStaffTask } from '@interdomestik/domain-membership-billing/sponsors/staff-tasks';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { entryReason, groupSponsorTasks, TASK_KINDS } from './group-tasks.core';
import { SponsorTaskList } from './task-list';
import { SponsorTasksLink } from './sponsor-tasks-link';

vi.mock('./task-action-form', () => ({
  TaskActionForm: ({ kind }: { kind: string }) => <div>{`form:${kind}`}</div>,
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    `${key}${values ? `:${JSON.stringify(values)}` : ''}`,
  useFormatter: () => ({ dateTime: (value: Date) => value.toISOString() }),
}));

const now = new Date('2026-11-08T00:00:00Z');
const tasks: SponsorStaffTask[] = [
  { kind: 'intent_review', intentId: 'i1', userId: 'u1', since: now },
  { kind: 'observed_cancel', intentId: 'i2', userId: 'u2', at: now, state: 'done' },
  { kind: 'scheduled_cancel', intentId: 'i7', userId: 'u7', at: now },
  {
    kind: 'charge',
    chargeId: 'c1',
    intentId: 'i3',
    userId: 'u3',
    providerTransactionId: 'txn_1',
    billingPeriodStartsAt: now,
    foundAt: now,
  },
  {
    kind: 'entry_review',
    entryId: 'e1',
    termId: 't1',
    sponsorId: 's1',
    userId: null,
    reason: 'paddle_state',
  },
  {
    kind: 'entry_review',
    entryId: 'e2',
    termId: 't1',
    sponsorId: 's1',
    userId: null,
    reason: 'empty_interval',
  },
  {
    kind: 'entry_review',
    entryId: 'e3',
    termId: 't1',
    sponsorId: 's1',
    userId: null,
    reason: 'binding',
  },
  {
    kind: 'rejected_entry',
    entryId: 'e4',
    termId: 't2',
    sponsorId: 's2',
    userId: 'u4',
    reason: null,
  },
  { kind: 'checkout_race', subscriptionId: 'sub1', userId: 'u5' },
  { kind: 'unactivated_account', userId: 'u6', lastEnd: now },
];

describe('sponsor task groups', () => {
  it('groups every kind in order without dropping tasks', () => {
    const groups = groupSponsorTasks([...tasks].reverse());
    expect(groups.map(group => group.kind)).toEqual(TASK_KINDS);
    expect(groups.flatMap(group => group.tasks)).toHaveLength(tasks.length);
    expect(groups.find(group => group.kind === 'entry_review')?.tasks).toHaveLength(3);
    expect(groupSponsorTasks([])).toEqual([]);
  });

  it('renders each explanation, reasons, administrative forms and admin user links', () => {
    render(<SponsorTaskList tasks={tasks} />);
    TASK_KINDS.forEach(kind => {
      expect(screen.getByRole('heading', { name: `kinds.${kind}.title` })).toBeInTheDocument();
      expect(screen.getByText(`kinds.${kind}.help`)).toBeInTheDocument();
    });
    for (const reason of ['paddle_state', 'empty_interval', 'binding'])
      expect(screen.getByText(`reasons.${reason}`)).toBeInTheDocument();
    expect(screen.getByText('form:evidence')).toBeInTheDocument();
    expect(screen.getByText('form:close')).toBeInTheDocument();
    expect(screen.getByText('form:acknowledge')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'person:{"id":"u6"}' })).toHaveAttribute(
      'href',
      '/admin/users/u6'
    );
    expect(screen.getByText('erasureRule')).toBeInTheDocument();
    expect(
      screen.getByText(`scheduledAt:${JSON.stringify({ date: now.toISOString() })}`)
    ).toBeInTheDocument();
  });

  it('shows an empty state and offers the locale-aware tasks link', () => {
    render(
      <>
        <SponsorTaskList tasks={[]} />
        <SponsorTasksLink area="staff" />
        <SponsorTasksLink area="admin" />
      </>
    );
    expect(screen.getByRole('status')).toHaveTextContent('empty');
    expect(
      screen.getAllByRole('link', { name: 'tasksLink' }).map(link => link.getAttribute('href'))
    ).toEqual(['/staff/sponsors/tasks', '/admin/sponsors/tasks']);
  });

  it('uses safe generic copy for an unknown review reason', () => {
    expect(entryReason(null)).toBe('unknown');
    expect(entryReason('private detail')).toBe('unknown');
  });
});
