import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dateTime: vi.fn(() => 'May 4, 2026, 1:00 PM'),
  getMemberLatestPublicResponse: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock('@interdomestik/domain-claims/support-handoffs/response', () => ({
  getMemberLatestPublicResponse: mocks.getMemberLatestPublicResponse,
}));

vi.mock('lucide-react', () => ({
  MessageSquareText: () => <span aria-hidden="true" />,
}));

vi.mock('./_public-response-acknowledgement-form', () => ({
  PublicResponseAcknowledgementForm: (props: {
    acknowledgedAt: string | null;
    acknowledgedAtLabel: string | null;
    expectedPublicResponseVersion: number;
    handoffId: string;
    locale: string;
    memberReplySlot?: ReactNode;
    permalink: string;
  }) => (
    <div
      data-testid="mock-public-response-acknowledgement"
      data-acknowledged-at={props.acknowledgedAt ?? ''}
      data-acknowledged-at-label={props.acknowledgedAtLabel ?? ''}
      data-handoff-id={props.handoffId}
      data-locale={props.locale}
      data-permalink={props.permalink}
      data-version={props.expectedPublicResponseVersion}
    >
      {props.acknowledgedAt ? props.memberReplySlot : null}
    </div>
  ),
}));

vi.mock('./_member-reply-form', () => ({
  MemberReplyForm: (props: {
    expectedPublicResponseVersion: number;
    handoffId: string;
    labels: Record<string, string>;
  }) => (
    <div
      data-testid="mock-member-reply-form"
      data-handoff-id={props.handoffId}
      data-version={props.expectedPublicResponseVersion}
    />
  ),
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
    if (key === 'publicResponse.acknowledgedAt') {
      return `Acknowledged ${values?.date}`;
    }
    if (key === 'memberReply.sent') {
      return 'Reply sent';
    }
    return key;
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mocks.routerRefresh,
  }),
}));

import { PublicResponseBanner } from './_public-response-banner';

describe('PublicResponseBanner', () => {
  it('renders the latest public response with a localized timestamp', async () => {
    mocks.getMemberLatestPublicResponse.mockResolvedValueOnce({
      handoffId: 'handoff-1',
      publicResponse: 'We are reviewing your request.\nWe will update you soon.',
      publicResponseAt: '2026-05-04T11:00:00.000Z',
      publicResponseAcknowledged: false,
      publicResponseAcknowledgedAt: null,
      publicResponseAcknowledgedVersion: null,
      publicResponseVersion: 2,
      memberReply: null,
      memberReplyAt: null,
      memberReplyResponseVersion: null,
    });

    render(
      await PublicResponseBanner({
        handoffId: 'handoff-1',
        locale: 'en',
        memberId: 'member-1',
        selectedClaim: { id: 'claim-1' },
        tenantId: 'tenant-1',
      })
    );

    expect(mocks.getMemberLatestPublicResponse).toHaveBeenCalledWith({
      claimId: 'claim-1',
      handoffId: 'handoff-1',
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
    expect(screen.getByTestId('mock-public-response-acknowledgement')).toHaveAttribute(
      'data-version',
      '2'
    );
    expect(screen.getByTestId('mock-public-response-acknowledgement')).toHaveAttribute(
      'data-permalink',
      '/en/member/help?handoffId=handoff-1'
    );
    expect(screen.queryByTestId('mock-member-reply-form')).not.toBeInTheDocument();
    expect(screen.queryByText('staff-1')).not.toBeInTheDocument();
  });

  it('passes a server-formatted acknowledgement label and current-cycle reply form into the client components', async () => {
    mocks.getMemberLatestPublicResponse.mockResolvedValueOnce({
      handoffId: 'handoff-1',
      publicResponse: 'Acknowledged response.',
      publicResponseAt: '2026-05-04T11:00:00.000Z',
      publicResponseAcknowledged: true,
      publicResponseAcknowledgedAt: '2026-05-04T12:00:00.000Z',
      publicResponseAcknowledgedVersion: 2,
      publicResponseVersion: 2,
      memberReply: null,
      memberReplyAt: null,
      memberReplyResponseVersion: null,
    });

    render(
      await PublicResponseBanner({
        handoffId: 'handoff-1',
        locale: 'sq',
        memberId: 'member-1',
        selectedClaim: null,
        tenantId: 'tenant-1',
      })
    );

    expect(mocks.dateTime).toHaveBeenCalledWith(new Date('2026-05-04T12:00:00.000Z'), {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    expect(screen.getByTestId('mock-public-response-acknowledgement')).toHaveAttribute(
      'data-acknowledged-at-label',
      'Acknowledged May 4, 2026, 1:00 PM'
    );
    expect(screen.getByTestId('mock-member-reply-form')).toHaveAttribute('data-version', '2');
  });

  it('hides the reply form after a same-cycle member reply has been submitted', async () => {
    mocks.getMemberLatestPublicResponse.mockResolvedValueOnce({
      handoffId: 'handoff-1',
      publicResponse: 'Acknowledged response.',
      publicResponseAt: '2026-05-04T11:00:00.000Z',
      publicResponseAcknowledged: true,
      publicResponseAcknowledgedAt: '2026-05-04T12:00:00.000Z',
      publicResponseAcknowledgedVersion: 2,
      publicResponseVersion: 2,
      memberReply: 'This resolves my request.',
      memberReplyAt: '2026-05-04T12:05:00.000Z',
      memberReplyResponseVersion: 2,
    });

    render(
      await PublicResponseBanner({
        handoffId: 'handoff-1',
        locale: 'en',
        memberId: 'member-1',
        selectedClaim: null,
        tenantId: 'tenant-1',
      })
    );

    expect(screen.queryByTestId('mock-member-reply-form')).not.toBeInTheDocument();
    expect(screen.getByTestId('member-reply-success')).toHaveTextContent('Reply sent');
  });

  it('keeps the reply form hidden after staff follows up to a member reply', async () => {
    mocks.getMemberLatestPublicResponse.mockResolvedValueOnce({
      handoffId: 'handoff-1',
      publicResponse: 'Follow-up after your reply.',
      publicResponseAt: '2026-05-04T12:30:00.000Z',
      publicResponseAcknowledged: true,
      publicResponseAcknowledgedAt: '2026-05-04T12:45:00.000Z',
      publicResponseAcknowledgedVersion: 3,
      publicResponseVersion: 3,
      memberReply: 'This resolves my request.',
      memberReplyAt: '2026-05-04T12:05:00.000Z',
      memberReplyResponseVersion: 2,
    });

    render(
      await PublicResponseBanner({
        handoffId: 'handoff-1',
        locale: 'en',
        memberId: 'member-1',
        selectedClaim: null,
        tenantId: 'tenant-1',
      })
    );

    expect(screen.queryByTestId('mock-member-reply-form')).not.toBeInTheDocument();
    expect(screen.getByTestId('member-reply-success')).toHaveTextContent('Reply sent');
  });

  it('renders nothing when no active handoff has a public response', async () => {
    mocks.getMemberLatestPublicResponse.mockResolvedValueOnce(null);

    const ui = await PublicResponseBanner({
      locale: 'en',
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
      locale: 'en',
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
