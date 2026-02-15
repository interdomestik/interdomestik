import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ActivityFeed } from './activity-feed';

describe('ActivityFeed', () => {
  it('falls back to unknown time for invalid occurredAt values', () => {
    render(
      <ActivityFeed
        activities={[
          {
            id: 'a1',
            type: 'note',
            subject: 'Broken timestamp',
            description: null,
            occurredAt: 'not-a-real-date',
            createdAt: null,
            agent: { name: 'Agent KS' },
          },
        ]}
      />
    );

    expect(screen.getByText('Broken timestamp')).toBeInTheDocument();
    expect(screen.getByText('Unknown time')).toBeInTheDocument();
  });
});
