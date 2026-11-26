import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemberClaimTimeline } from './member-claim-timeline';

vi.mock('next-intl', () => ({
  useLocale: () => 'sq',
  useTranslations: () => (key: string) => `t:${key}`,
}));

describe('MemberClaimTimeline', () => {
  it('shows the empty state under a level-two heading when there are no public events', () => {
    render(<MemberClaimTimeline events={[]} />);

    const root = screen.getByTestId('ops-timeline');
    expect(within(root).getByRole('heading', { level: 2, name: 't:title' })).toBeInTheDocument();
    expect(within(root).getByTestId('ops-timeline-empty')).toHaveTextContent('t:empty');
    expect(within(root).queryByRole('list')).not.toBeInTheDocument();
  });

  it('keeps the supplied event order as an ordered list with machine-readable times', () => {
    render(
      <MemberClaimTimeline
        events={[
          {
            id: 'e1',
            title: 'Evaluation',
            date: '2026-04-14T09:00:00.000Z',
            description: 'We received your documents.',
          },
          { id: 'e2', title: 'Verification', date: '2026-04-15T12:30:00.000Z' },
        ]}
      />
    );

    const list = screen.getByRole('list');
    expect(list.tagName).toBe('OL');
    const items = within(list).getAllByTestId('ops-timeline-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Evaluation');
    expect(items[1]).toHaveTextContent('Verification');
    expect(items[0].querySelector('time')).toHaveAttribute('dateTime', '2026-04-14T09:00:00.000Z');
    expect(items[0].querySelector('time')?.textContent).toMatch(/^14\.04\.2026 \d{2}:\d{2}$/);
    expect(within(items[0]).getByText('We received your documents.')).toBeInTheDocument();
    expect(items[1].querySelectorAll('p')).toHaveLength(2);
    expect(screen.queryByTestId('ops-timeline-empty')).not.toBeInTheDocument();
  });

  it('omits an unreadable dateTime and reads an offsetless one as UTC', () => {
    render(
      <MemberClaimTimeline
        events={[
          { id: 'e1', title: 'Submitted', date: 'unknown' },
          { id: 'e2', title: 'Offsetless', date: '2026-04-14T00:30:00' },
        ]}
      />
    );
    expect(screen.getAllByTestId('ops-timeline-item')[1].querySelector('time')).toHaveAttribute(
      'dateTime',
      '2026-04-14T00:30:00.000Z'
    );

    const time = screen.getAllByTestId('ops-timeline-item')[0].querySelector('time');
    expect(time).not.toHaveAttribute('dateTime');
    expect(time).toHaveTextContent('unknown');
  });
});
