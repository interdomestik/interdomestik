import { getMemberReferralCardData } from '@/actions/member-referrals';
import { getAgentReferralLink } from '@/actions/referrals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MockButton,
  MockCard,
  MockCardContent,
  MockCardHeader,
  MockCardTitle,
  MockInput,
  MockSkeleton,
} from '@/test/referral-card-test-mocks';
import { ReferralLinkCard } from '@/components/agent/referral-link-card';

import { ReferralCard } from './referral-card';

vi.mock('@/actions/member-referrals', () => ({
  getMemberReferralCardData: vi.fn(),
}));

vi.mock('@/actions/referrals', () => ({
  getAgentReferralLink: vi.fn(),
}));

vi.mock('@/lib/public-links', () => ({
  normalizePublicLink: (link: string) =>
    link.replace('https://localhost:3000', 'https://pilot.127.0.0.1.nip.io:3000'),
  normalizeWhatsAppShareUrl: (shareUrl: string) =>
    shareUrl.replace(
      'https%3A%2F%2Flocalhost%3A3000',
      'https%3A%2F%2Fpilot.127.0.0.1.nip.io%3A3000'
    ),
}));

vi.mock('@interdomestik/ui/components/button', () => ({
  Button: MockButton,
}));

vi.mock('@interdomestik/ui/components/card', () => ({
  Card: MockCard,
  CardContent: MockCardContent,
  CardHeader: MockCardHeader,
  CardTitle: MockCardTitle,
}));

vi.mock('@interdomestik/ui/components/input', () => ({
  Input: MockInput,
}));

vi.mock('@interdomestik/ui/components/skeleton', () => ({
  Skeleton: MockSkeleton,
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string, values?: Record<string, string>) => {
    const translationsByNamespace: Record<string, Record<string, string>> = {
      'dashboard.referral': {
        title: 'Invite Friends & Earn',
        description:
          'Share your referral link and track the reward credit you earn from first paid memberships.',
        friends: 'Friends Invited',
        pending: 'Pending',
        credited: 'Available Credit',
        paid: 'Paid Out',
        copied: 'Link copied!',
        copyError: 'Failed to copy',
        loadError: 'Failed to load referral details',
        copyAction: 'Copy referral link',
        shareAction: 'Share referral link',
        rewardInfoCreditOnly:
          'Members earn {reward} in account credit after the first paid membership activates.',
        rewardInfoPayout:
          'Members earn {reward} after the first paid membership activates. Payouts unlock once available credit reaches {threshold}.',
        payoutEligible: 'Payout-ready balance: {amount}',
        programDisabled: 'Member referral rewards are currently disabled for this tenant.',
      },
      'agent.commissions.referralLink': {
        title: 'Your referral link',
        description: 'Share this link to earn commissions for new memberships.',
        loadError: 'Failed to load referral link',
        copied: 'Link copied!',
        copyError: 'Failed to copy link',
      },
    };

    const template = translationsByNamespace[namespace ?? '']?.[key] ?? key;

    return Object.entries(values ?? {}).reduce(
      (result, [name, replacement]) => result.replace(`{${name}}`, replacement),
      template
    );
  },
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

describe('ReferralCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    window.open = vi.fn();

    vi.mocked(getMemberReferralCardData).mockResolvedValue({
      success: true,
      data: {
        link: 'https://localhost:3000?ref=ABC123',
        whatsappShareUrl:
          'https://wa.me/?text=Join%20Asistenca%20with%20my%20referral%20link%20https%3A%2F%2Flocalhost%3A3000%3Fref%3DABC123',
        stats: {
          totalReferred: 3,
          pendingRewards: 10,
          creditedRewards: 25,
          payoutEligibleRewards: 25,
          paidRewards: 5,
          rewardsCurrency: 'EUR',
        },
        settings: {
          tenantId: 'tenant_ks',
          enabled: true,
          rewardType: 'percent',
          fixedRewardCents: 0,
          percentRewardBps: 2500,
          settlementMode: 'credit_or_payout',
          payoutThresholdCents: 10000,
          fraudReviewEnabled: true,
          currencyCode: 'EUR',
          qualifyingEventType: 'first_paid_membership',
        },
      },
    });

    vi.mocked(getAgentReferralLink).mockResolvedValue({
      success: true,
      data: {
        code: 'STEFAN-GMV1SU',
        link: 'https://localhost:3000?ref=STEFAN-GMV1SU',
      },
      error: undefined,
      fieldErrors: undefined,
    });
  });

  it('renders referral stats and dynamic reward summary', async () => {
    render(<ReferralCard />);

    expect(await screen.findByText('Invite Friends & Earn')).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('https://pilot.127.0.0.1.nip.io:3000?ref=ABC123')
    ).toBeInTheDocument();
    expect(screen.getByText('Friends Invited')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/25.00%/)).toBeInTheDocument();
    expect(screen.getByText(/Payout-ready balance:/)).toBeInTheDocument();
  });

  it('copies the referral link', async () => {
    render(<ReferralCard />);

    const copyButton = await screen.findByRole('button', { name: 'Copy referral link' });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'https://pilot.127.0.0.1.nip.io:3000?ref=ABC123'
      );
    });
    expect(toastSuccess).toHaveBeenCalledWith('Link copied!');
  });

  it('normalizes the shared referral URL before opening WhatsApp share', async () => {
    render(<ReferralCard />);

    const shareButton = await screen.findByRole('button', { name: 'Share referral link' });
    fireEvent.click(shareButton);

    expect(window.open).toHaveBeenCalledWith(
      'https://wa.me/?text=Join%20Asistenca%20with%20my%20referral%20link%20https%3A%2F%2Fpilot.127.0.0.1.nip.io%3A3000%3Fref%3DABC123',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('does not load member referral data for agent viewers on the member surface', () => {
    render(<ReferralCard isAgent={true} />);

    expect(getMemberReferralCardData).not.toHaveBeenCalled();
    expect(screen.queryByText('Invite Friends & Earn')).not.toBeInTheDocument();
  });

  it('can transition from agent viewer to member viewer without hook-order errors', async () => {
    const { rerender } = render(<ReferralCard isAgent={true} />);

    rerender(<ReferralCard isAgent={false} />);

    expect(await screen.findByText('Invite Friends & Earn')).toBeInTheDocument();
    expect(getMemberReferralCardData).toHaveBeenCalled();
  });

  it('keeps the localized load error copy when the stats action returns a raw backend error string', async () => {
    vi.mocked(getMemberReferralCardData).mockResolvedValueOnce({
      success: false,
      error: 'Failed to fetch referral stats',
    });

    render(<ReferralCard />);

    expect(await screen.findAllByText('Failed to load referral details')).toHaveLength(2);
    expect(screen.queryByText('Failed to fetch referral stats')).not.toBeInTheDocument();
  });

  it('normalizes the displayed agent referral link to the live origin', async () => {
    render(<ReferralLinkCard />);

    expect(
      await screen.findByDisplayValue('https://pilot.127.0.0.1.nip.io:3000?ref=STEFAN-GMV1SU')
    ).toBeInTheDocument();
  });

  it('copies the normalized agent referral link instead of the localhost fallback', async () => {
    render(<ReferralLinkCard />);

    const copyButton = await screen.findByRole('button');
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'https://pilot.127.0.0.1.nip.io:3000?ref=STEFAN-GMV1SU'
      );
    });
    expect(toastSuccess).toHaveBeenCalledWith('Link copied!');
    expect(toastError).not.toHaveBeenCalled();
  });
});
