import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MembershipOpsPage,
  actionMocks,
  localeMocks,
  selectionMocks,
  setupMembershipOpsPageHarness,
  timelineMocks,
} from './__tests__/membership-ops-page-harness';

const baseDate = new Date('2026-03-15T00:00:00.000Z');
const dayMs = 24 * 60 * 60 * 1000;

function buildSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    status: 'active',
    provider: 'paddle',
    planId: 'plan-family',
    createdAt: '2026-01-01T00:00:00.000Z',
    currentPeriodEnd: '2026-04-01T00:00:00.000Z',
    plan: { name: 'Family' },
    gracePeriodEndsAt: null,
    ...overrides,
  } as never;
}

describe('DetailView current-period and grace facts', () => {
  setupMembershipOpsPageHarness();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(baseDate);
    selectionMocks.selectedId = 'sub-1';
    actionMocks.getMembershipActions.mockReturnValue({ primary: undefined, secondary: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('never labels the current period end as a confirmed renewal', () => {
    render(<MembershipOpsPage subscriptions={[buildSubscription()]} documents={[]} />);

    expect(screen.getByText('plan.current_period_label')).toBeInTheDocument();
    expect(screen.queryByText('plan.renews_label')).not.toBeInTheDocument();
  });

  it('labels a scheduled cancellation by its period end without claiming renewal', () => {
    render(
      <MembershipOpsPage
        subscriptions={[buildSubscription({ cancelAtPeriodEnd: true })]}
        documents={[]}
      />
    );

    expect(screen.getByText('plan.current_period_label')).toBeInTheDocument();
    expect(screen.queryByText('plan.renews_label')).not.toBeInTheDocument();
  });

  it('shows a localized unavailable value when the current period end is null', () => {
    render(
      <MembershipOpsPage
        subscriptions={[buildSubscription({ currentPeriodEnd: null })]}
        documents={[]}
      />
    );

    expect(screen.getByTestId('membership-current-period-end')).toHaveTextContent('plan.na');
  });

  it('does not render a grace deadline section for an active subscription', () => {
    render(
      <MembershipOpsPage subscriptions={[buildSubscription({ status: 'active' })]} documents={[]} />
    );

    expect(screen.queryByTestId('membership-grace-deadline')).not.toBeInTheDocument();
  });

  it('shows a future grace deadline distinctly from a passed one', () => {
    render(
      <MembershipOpsPage
        subscriptions={[
          buildSubscription({
            status: 'past_due',
            gracePeriodEndsAt: new Date(baseDate.getTime() + 5 * dayMs).toISOString(),
          }),
        ]}
        documents={[]}
      />
    );

    expect(screen.getByTestId('membership-grace-deadline')).toHaveTextContent(
      'dunning.grace_deadline_future_label'
    );
    expect(screen.getByTestId('membership-grace-deadline')).not.toHaveTextContent(
      'dunning.grace_deadline_passed_label'
    );
  });

  it('updates the grace label when the deadline passes while the detail stays open', () => {
    render(
      <MembershipOpsPage
        subscriptions={[
          buildSubscription({
            status: 'past_due',
            gracePeriodEndsAt: new Date(baseDate.getTime() + 5000).toISOString(),
          }),
        ]}
        documents={[]}
      />
    );

    expect(screen.getByTestId('membership-grace-deadline')).toHaveTextContent(
      'dunning.grace_deadline_future_label'
    );
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByTestId('membership-grace-deadline')).toHaveTextContent(
      'dunning.grace_deadline_passed_label'
    );
  });

  it('shows a passed grace deadline distinctly from a future one', () => {
    render(
      <MembershipOpsPage
        subscriptions={[
          buildSubscription({
            status: 'past_due',
            gracePeriodEndsAt: new Date(baseDate.getTime() - 5 * dayMs).toISOString(),
          }),
        ]}
        documents={[]}
      />
    );

    expect(screen.getByTestId('membership-grace-deadline')).toHaveTextContent(
      'dunning.grace_deadline_passed_label'
    );
    expect(screen.getByTestId('membership-grace-deadline')).not.toHaveTextContent(
      'dunning.grace_deadline_future_label'
    );
  });

  it('treats the exact grace deadline as passed', () => {
    render(
      <MembershipOpsPage
        subscriptions={[
          buildSubscription({ status: 'past_due', gracePeriodEndsAt: baseDate.toISOString() }),
        ]}
        documents={[]}
      />
    );

    expect(screen.getByTestId('membership-grace-deadline')).toHaveTextContent(
      'dunning.grace_deadline_passed_label'
    );
  });

  it('does not invent a grace deadline when none exists, and never claims access was restored', () => {
    render(
      <MembershipOpsPage
        subscriptions={[buildSubscription({ status: 'past_due', gracePeriodEndsAt: null })]}
        documents={[]}
      />
    );

    const graceSection = screen.getByTestId('membership-grace-deadline');
    expect(graceSection).toHaveTextContent('dunning.grace_deadline_unavailable');
    expect(screen.queryByText(/restored/i)).not.toBeInTheDocument();
  });

  it('shows the selected subscription’s own current period end when switching selection', () => {
    const subscriptions = [
      buildSubscription({ id: 'sub-1', currentPeriodEnd: '2026-04-01T00:00:00.000Z' }),
      buildSubscription({ id: 'sub-2', currentPeriodEnd: null }),
    ];

    const view = render(<MembershipOpsPage subscriptions={subscriptions} documents={[]} />);
    expect(screen.getByTestId('membership-current-period-end')).not.toHaveTextContent('plan.na');

    selectionMocks.selectedId = 'sub-2';
    view.rerender(<MembershipOpsPage subscriptions={subscriptions} documents={[]} />);
    expect(screen.getByTestId('membership-current-period-end')).toHaveTextContent('plan.na');
  });

  it('does not retain the previous subscription’s grace deadline after selection changes', () => {
    const subscriptions = [
      buildSubscription({
        id: 'sub-1',
        status: 'past_due',
        gracePeriodEndsAt: new Date(baseDate.getTime() + 5 * dayMs).toISOString(),
      }),
      buildSubscription({ id: 'sub-2', status: 'past_due', gracePeriodEndsAt: null }),
    ];

    const view = render(<MembershipOpsPage subscriptions={subscriptions} documents={[]} />);
    expect(screen.getByTestId('membership-grace-deadline')).toHaveTextContent(
      'dunning.grace_deadline_future_label'
    );

    selectionMocks.selectedId = 'sub-2';
    view.rerender(<MembershipOpsPage subscriptions={subscriptions} documents={[]} />);
    expect(screen.getByTestId('membership-grace-deadline')).toHaveTextContent(
      'dunning.grace_deadline_unavailable'
    );
    expect(screen.getByTestId('membership-grace-deadline')).not.toHaveTextContent(
      'dunning.grace_deadline_future_label'
    );
  });

  it('formats the current period end using the member locale rather than a fixed default', () => {
    localeMocks.locale = 'mk';
    render(<MembershipOpsPage subscriptions={[buildSubscription()]} documents={[]} />);

    expect(screen.getByTestId('membership-current-period-end')).toHaveTextContent(
      /^\d{2}\.\d{2}\.\d{4}$/
    );
  });

  it('formats a parseable timeline timestamp for the member locale', () => {
    localeMocks.locale = 'mk';
    timelineMocks.events = [{ id: 'period', date: '2026-04-01T00:00:00.000Z' }];
    render(<MembershipOpsPage subscriptions={[buildSubscription()]} documents={[]} />);

    expect(screen.getByTestId('membership-timeline-date')).toHaveTextContent(
      /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/
    );
    expect(screen.getByTestId('membership-timeline-date')).not.toHaveTextContent('Invalid Date');
  });
});
