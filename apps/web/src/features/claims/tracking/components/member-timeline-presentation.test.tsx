import { OpsTimeline } from '@/components/ops';
import { toOpsTimelineEvents } from '@/components/ops/adapters/claims';
import { render, screen } from '@testing-library/react';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { describe, expect, it, vi } from 'vitest';
import type { ClaimTimelineEvent } from '../types';
import { presentMemberDomainEvent } from '../server/member-event-presentation-registry';
import { useTrackingLabelTranslator } from './useTrackingLabelTranslator';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    const messages: Record<string, Record<string, string>> = {
      'claims-tracking.status': { evaluation: 'Evaluation' },
      'claims-tracking.tracking.timeline': {
        generic: 'Case update',
        redacted: 'Case update unavailable',
      },
    };
    return (key: string) => messages[namespace ?? '']?.[key] ?? key;
  },
}));

const currentStatus: ClaimStatus = 'evaluation';

function TrackingTimeline({ events }: Readonly<{ events: ClaimTimelineEvent[] }>) {
  const translate = useTrackingLabelTranslator();
  const presentedEvents = toOpsTimelineEvents(events).map(event => ({
    ...event,
    title: translate(event.title),
  }));

  return (
    <OpsTimeline
      title="Timeline"
      events={presentedEvents}
      emptyLabel="No updates yet"
      formatTimestamp={value => value}
    />
  );
}

describe('member timeline presentation', () => {
  it('renders the authorized public status note through the shared timeline grammar', () => {
    const event = presentMemberDomainEvent(
      { currentStatus },
      {
        id: 'event-status',
        createdAt: new Date('2026-09-12T08:00:00.000Z'),
        eventName: 'claim.status_changed',
        eventVersion: 1,
        note: 'We are reviewing the submitted evidence.',
        payload: { fromStatus: 'submitted', toStatus: 'evaluation' },
      }
    );

    render(<TrackingTimeline events={[event]} />);

    expect(screen.getByRole('heading', { name: 'Timeline' })).toBeVisible();
    expect(screen.getByText('Evaluation')).toBeVisible();
    expect(screen.getByText('We are reviewing the submitted evidence.')).toBeVisible();
    expect(screen.getByText('2026-09-12T08:00:00.000Z')).toBeVisible();
  });

  it('renders safe fixed fallbacks without exposing raw event data', () => {
    const unknown = presentMemberDomainEvent(
      { currentStatus },
      {
        id: 'event-unknown',
        createdAt: new Date('2026-09-12T09:00:00.000Z'),
        eventName: 'claim.status_changed',
        eventVersion: 99,
        note: 'private fallback note',
        payload: { actorEmail: 'private@example.test' },
      }
    );
    const redacted = presentMemberDomainEvent(
      { currentStatus, piiStatus: 'erased_or_unavailable' },
      {
        id: 'event-erased',
        createdAt: new Date('2026-09-12T10:00:00.000Z'),
        eventName: 'claim.status_changed',
        eventVersion: 1,
        note: 'erased public note',
        payload: { fromStatus: 'submitted', toStatus: 'evaluation' },
      }
    );

    render(<TrackingTimeline events={[unknown, redacted]} />);

    expect(screen.getByText('Case update')).toBeVisible();
    expect(screen.getByText('Case update unavailable')).toBeVisible();
    expect(screen.queryByText('claim.status_changed')).not.toBeInTheDocument();
    expect(screen.queryByText('private fallback note')).not.toBeInTheDocument();
    expect(screen.queryByText('private@example.test')).not.toBeInTheDocument();
    expect(screen.queryByText('erased public note')).not.toBeInTheDocument();
  });
});
