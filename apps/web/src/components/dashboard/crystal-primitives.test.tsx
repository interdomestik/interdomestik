import { render, screen } from '@testing-library/react';
import { MatteAnchorCard, RefractiveGlassPanel, Stepper, Timeline } from '@interdomestik/ui';
import { describe, expect, it } from 'vitest';

describe('Crystal primitives', () => {
  it('covers contract', () => {
    render(
      <>
        <MatteAnchorCard href="/case" label="Open case" description="Continue safely" />
        <RefractiveGlassPanel role="region" aria-label="Actions" children="Review documents" />
        <Stepper
          ariaLabel="Case progress"
          steps={[
            { id: '1', label: 'Check', state: 'completed', stateLabel: 'Completed' },
            { id: '2', label: 'Apply', state: 'current', stateLabel: 'Current', href: '/apply' },
            { id: '3', label: 'Follow up', state: 'future', stateLabel: 'Upcoming' },
            { id: '4', label: 'Payment', state: 'error', stateLabel: 'Needs attention' },
          ]}
        />
        <Timeline
          ariaLabel="Case timeline"
          emptyLabel="No activity yet"
          items={[
            {
              id: '1',
              title: 'Case opened',
              dateTime: '2026-08-26',
              dateLabel: '26 August',
              stateLabel: 'Completed',
            },
          ]}
        />
        <Timeline ariaLabel="Empty timeline" emptyLabel="No activity yet" items={[]} />
      </>
    );
    const { getByRole: role, getByText: text } = screen;
    const a = role('link', { name: 'Open case' });
    a.focus();
    expect(a).toHaveFocus();
    expect(a).toHaveAttribute('href', '/case');
    expect(a).toHaveClass('min-h-11');
    expect(role('region', { name: 'Actions' })).toHaveTextContent('Review documents');
    expect(role('list', { name: 'Case progress' }).querySelectorAll('li')).toHaveLength(4);
    expect(role('link', { name: /Apply/ })).toHaveAttribute('aria-current', 'step');
    expect(text('Needs attention')).toBeInTheDocument();
    expect(text('26 August')).toHaveAttribute('datetime', '2026-08-26');
    expect(role('status', { name: 'Empty timeline' })).toHaveTextContent('No activity yet');
  });
});
