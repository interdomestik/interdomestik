import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemberClaimProgressSummary } from './MemberClaimProgressSummary';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace}.${key}`,
}));

type Summary = Parameters<typeof MemberClaimProgressSummary>[0]['progressSummary'];
const summary = (patch: Partial<Summary> = {}): Summary => ({
  currentStatusLabelKey: 'claims-tracking.status.evaluation',
  latestUpdateAt: '2026-04-15T12:30:00.000Z',
  latestUpdateLabelKey: 'claims-tracking.status.verification',
  latestUpdateNote: null,
  nextStepKey: 'claims-tracking.status.next_step.evaluation',
  ...patch,
});

describe('MemberClaimProgressSummary', () => {
  it('pairs each progress fact with its term and a machine-readable update time', () => {
    render(
      <MemberClaimProgressSummary latestUpdateDate="15.04.2026 14:30" progressSummary={summary()} />
    );

    const root = screen.getByTestId('member-claim-progress-summary');
    expect(
      within(root).getByRole('heading', { level: 2, name: 'claims.detail.progress.title' })
    ).toBeInTheDocument();
    const current = screen.getByTestId('member-claim-current-state');
    expect(current.tagName).toBe('DD');
    expect(current).toHaveTextContent('claims-tracking.status.evaluation');
    expect(current.previousElementSibling).toHaveTextContent('claims.detail.progress.currentState');
    expect(screen.getByTestId('member-claim-latest-update')).toHaveTextContent(
      'claims-tracking.status.verification'
    );
    const date = screen.getByTestId('member-claim-latest-update-date');
    expect(date.tagName).toBe('TIME');
    expect(date).toHaveAttribute('dateTime', '2026-04-15T12:30:00.000Z');
    expect(date).toHaveTextContent('15.04.2026 14:30');
    expect(screen.queryByTestId('member-claim-latest-update-note')).not.toBeInTheDocument();
  });

  it('shows the public note and localizes the sensitive decline note', () => {
    const { rerender } = render(
      <MemberClaimProgressSummary
        latestUpdateDate="15.04.2026 14:30"
        progressSummary={summary({ latestUpdateNote: 'Your case moved into specialist review.' })}
      />
    );
    expect(screen.getByTestId('member-claim-latest-update-note')).toHaveTextContent(
      'Your case moved into specialist review.'
    );

    rerender(
      <MemberClaimProgressSummary
        latestUpdateDate="15.04.2026 14:30"
        progressSummary={summary({
          latestUpdateNote: 'We cannot accept this matter for staff-led recovery.',
        })}
      />
    );
    expect(screen.getByTestId('member-claim-latest-update-note')).toHaveTextContent(
      'claims.detail.recoveryDecision.reasons.other.description'
    );
  });

  it('omits the dateTime attribute when the update time cannot be read', () => {
    render(
      <MemberClaimProgressSummary
        latestUpdateDate="unknown"
        progressSummary={summary({ latestUpdateAt: 'unknown' })}
      />
    );
    expect(screen.getByTestId('member-claim-latest-update-date')).not.toHaveAttribute('dateTime');
  });
});
