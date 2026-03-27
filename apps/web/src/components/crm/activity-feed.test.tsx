import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      empty: 'Nuk ka ende aktivitete të regjistruara.',
      unknown_time: 'Koha e panjohur',
      logged_by: 'Regjistruar nga',
      anonymous_agent: 'Agjenti',
    };

    return translations[key] || key;
  },
}));

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
    expect(screen.getByText('Koha e panjohur')).toBeInTheDocument();
  });

  it('localizes the empty state copy', () => {
    render(<ActivityFeed activities={[]} />);

    expect(screen.getByText('Nuk ka ende aktivitete të regjistruara.')).toBeInTheDocument();
  });
});
