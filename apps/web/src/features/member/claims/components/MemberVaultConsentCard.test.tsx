import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      title: 'AI document extraction consent',
      description: 'Status for AI document extraction from evidence in this claim.',
      categoryLabel: 'Category',
      categoryEvidence: 'Evidence',
      metadataUpdatedLabel: 'Metadata updated',
      consentStatusLabel: 'AI document extraction status',
      statusAccepted: 'Accepted for AI document extraction',
      statusWithdrawn: 'Withdrawn for AI document extraction',
      statusMissing: 'Not recorded for AI document extraction',
      recordedAtLabel: 'Recorded',
      versionLabel: 'Privacy version',
      unavailable: 'Unavailable',
      empty: 'No eligible evidence metadata is available.',
      erased: 'Evidence metadata is unavailable for this protected subject.',
    };
    return messages[key] ?? key;
  },
}));

vi.mock('@/lib/utils/date', () => ({
  formatPilotDateTime: (value: string, _locale: string, fallback: string) =>
    value ? `DATE:${value}` : fallback,
}));

import type { SerializedVaultConsentDisplay } from '@/features/claims/tracking/server/member-vault-consent-serialization';
import { MemberVaultConsentCard } from './MemberVaultConsentCard';

describe('MemberVaultConsentCard', () => {
  it('renders nothing for a hidden display', () => {
    render(<MemberVaultConsentCard display={{ kind: 'hidden' }} />);
    expect(screen.queryByTestId('member-vault-consent')).not.toBeInTheDocument();
  });

  it('renders an item-free neutral erased state', () => {
    render(<MemberVaultConsentCard display={{ kind: 'subject_erased' }} />);
    const region = screen.getByRole('region', { name: 'AI document extraction consent' });
    expect(region).toHaveTextContent('Evidence metadata is unavailable');
    expect(region).not.toHaveTextContent(/\d+ item/i);
    expect(region.querySelector('ul')).toBeNull();
  });

  it('renders distinct qualified statuses and only an accepted version', () => {
    const display: SerializedVaultConsentDisplay = {
      kind: 'ready',
      items: [
        {
          category: 'evidence',
          updatedAt: '2026-07-05T10:00:00.000Z',
          consentStatus: 'accepted',
          consentRecordedAt: '2026-07-04T09:00:00.000Z',
          consentVersion: 'privacy-accepted',
        },
        {
          category: 'evidence',
          updatedAt: null,
          consentStatus: 'withdrawn',
          consentRecordedAt: '2026-07-03T09:00:00.000Z',
          consentVersion: null,
        },
        {
          category: 'evidence',
          updatedAt: null,
          consentStatus: 'missing',
          consentRecordedAt: null,
          consentVersion: null,
        },
      ],
    };
    render(<MemberVaultConsentCard display={display} />);

    const region = screen.getByRole('region', { name: 'AI document extraction consent' });
    expect(screen.queryAllByRole('status')).toHaveLength(0);
    expect(screen.getAllByText('AI document extraction status')).toHaveLength(3);
    const list = screen.getByRole('list');
    expect(list).toHaveAttribute('role', 'list');
    expect(list).not.toHaveAccessibleName();
    expect(region).toHaveTextContent('Accepted for AI document extraction');
    expect(region).toHaveTextContent('Withdrawn for AI document extraction');
    expect(region).toHaveTextContent('Not recorded for AI document extraction');
    expect(region).toHaveTextContent('privacy-accepted');
    expect(region).toHaveTextContent('DATE:2026-07-05T10:00:00.000Z');
    expect(region.querySelectorAll('a,button,input,select,textarea')).toHaveLength(0);
  });

  it('never renders extra raw document fields supplied at runtime', () => {
    const unsafeRuntimeDisplay = {
      kind: 'ready',
      items: [
        {
          category: 'evidence',
          updatedAt: null,
          consentStatus: 'missing',
          consentRecordedAt: null,
          consentVersion: null,
          id: 'raw-document-id',
          name: 'medical-private.pdf',
          fileType: 'application/pdf',
          fileSize: 999,
          filePath: '/private/legal/payment',
          url: 'https://secret.example',
        },
      ],
    } as unknown as SerializedVaultConsentDisplay;
    render(<MemberVaultConsentCard display={unsafeRuntimeDisplay} />);

    expect(screen.getByTestId('member-vault-consent').textContent).not.toMatch(
      /raw-document-id|medical-private|application\/pdf|999|private|legal|payment|secret\.example/i
    );
  });
});
