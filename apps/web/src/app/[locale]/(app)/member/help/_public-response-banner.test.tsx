import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dateTime: vi.fn(() => 'May 4, 2026, 1:00 PM'),
  getMemberLatestPublicResponse: vi.fn(),
}));

vi.mock('@interdomestik/domain-claims/support-handoffs/response', () => ({
  getMemberLatestPublicResponse: mocks.getMemberLatestPublicResponse,
}));

vi.mock('lucide-react', () => ({
  MessageSquareText: () => <span aria-hidden="true" />,
}));

vi.mock('next-intl/server', () => ({
  getFormatter: vi.fn(async () => ({
    dateTime: mocks.dateTime,
  })),
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, unknown>) => {
    if (key === 'publicResponse.title') {
      return 'Staff update';
    }
    if (key === 'publicResponse.updatedAt') {
      return `Updated ${values?.date}`;
    }
    return key;
  }),
}));

import { PublicResponseBanner } from './_public-response-banner';

describe('PublicResponseBanner', () => {
  it('renders the latest public response with a localized timestamp', async () => {
    mocks.getMemberLatestPublicResponse.mockResolvedValueOnce({
      publicResponse: 'We are reviewing your request.\nWe will update you soon.',
      publicResponseAt: '2026-05-04T11:00:00.000Z',
    });

    render(
      await PublicResponseBanner({
        memberId: 'member-1',
        selectedClaim: { id: 'claim-1' },
        tenantId: 'tenant-1',
      })
    );

    expect(mocks.getMemberLatestPublicResponse).toHaveBeenCalledWith({
      claimId: 'claim-1',
      memberId: 'member-1',
      tenantId: 'tenant-1',
    });
    expect(mocks.dateTime).toHaveBeenCalledWith(new Date('2026-05-04T11:00:00.000Z'), {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    expect(screen.getByTestId('member-support-handoff-public-response')).toHaveTextContent(
      'Staff update'
    );
    expect(screen.getByTestId('member-support-handoff-public-response-text')).toHaveTextContent(
      'We are reviewing your request. We will update you soon.'
    );
    expect(screen.getByTestId('member-support-handoff-public-response-updated')).toHaveTextContent(
      'Updated May 4, 2026, 1:00 PM'
    );
    expect(screen.queryByText('staff-1')).not.toBeInTheDocument();
  });

  it('renders nothing when no active handoff has a public response', async () => {
    mocks.getMemberLatestPublicResponse.mockResolvedValueOnce(null);

    const ui = await PublicResponseBanner({
      memberId: 'member-1',
      selectedClaim: null,
      tenantId: 'tenant-1',
    });

    expect(ui).toBeNull();
  });

  it('fails open when the public response lookup is unavailable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.getMemberLatestPublicResponse.mockRejectedValueOnce(new Error('database unavailable'));

    const ui = await PublicResponseBanner({
      memberId: 'member-1',
      selectedClaim: null,
      tenantId: 'tenant-1',
    });

    expect(ui).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      'Member support handoff public response lookup failed',
      expect.any(Error)
    );

    consoleError.mockRestore();
  });
});
