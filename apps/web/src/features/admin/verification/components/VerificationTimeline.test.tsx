import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import sq from '@/messages/sq/admin-leads.json';
import { VerificationTimeline } from './VerificationTimeline';

vi.unmock('next-intl');

describe('verification event presentation', () => {
  it('translates stored event labels and creation copy while retaining authored notes', () => {
    render(
      <NextIntlClientProvider locale="sq" messages={sq} timeZone="Europe/Skopje">
        <VerificationTimeline
          timeline={[
            {
              id: 'created',
              type: 'created',
              title: 'Payment Attempt Created',
              description: 'Cash payment recorded by Agent',
              actorName: 'Agent',
              date: new Date('2026-11-12T08:30:00Z'),
            },
            {
              id: 'approved',
              type: 'action',
              title: 'Approved',
              description: 'Authored verification note',
              date: new Date('2026-11-12T09:00:00Z'),
            },
          ]}
        />
      </NextIntlClientProvider>
    );
    expect(screen.getByText(sq.admin.leads.events.created)).toBeVisible();
    expect(
      screen.getByText(sq.admin.leads.events.cashRecorded.replace('{name}', 'Agent'))
    ).toBeVisible();
    expect(screen.getByText('Authored verification note')).toBeVisible();
    expect(screen.getByText('12.11.2026 09:30')).toBeVisible();
    expect(screen.queryByText('Payment Attempt Created')).not.toBeInTheDocument();
  });
});
