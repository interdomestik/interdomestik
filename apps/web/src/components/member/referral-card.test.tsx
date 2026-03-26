import {
  getMemberReferralLink,
  getMemberReferralProgramPreview,
  getMemberReferralStats,
} from '@/actions/member-referrals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReferralCard } from './referral-card';

vi.mock('@/actions/member-referrals', () => ({
  getMemberReferralLink: vi.fn(),
  getMemberReferralProgramPreview: vi.fn(),
  getMemberReferralStats: vi.fn(),
}));

vi.mock('@interdomestik/ui/components/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@interdomestik/ui/components/card', () => ({
  Card: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardContent: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardHeader: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props}>{children}</h2>
  ),
}));

vi.mock('@interdomestik/ui/components/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@interdomestik/ui/components/skeleton', () => ({
  Skeleton: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const translations: Record<string, string> = {
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
    };

    return Object.entries(values ?? {}).reduce(
      (result, [name, replacement]) => result.replace(`{${name}}`, replacement),
      translations[key] ?? key
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

    vi.mocked(getMemberReferralLink).mockResolvedValue({
      success: true,
      data: {
        code: 'ABC123',
        link: 'https://example.test/ref/ABC123',
        whatsappShareUrl: 'https://wa.me/?text=abc',
      },
    });
    vi.mocked(getMemberReferralStats).mockResolvedValue({
      success: true,
      data: {
        totalReferred: 3,
        pendingRewards: 10,
        creditedRewards: 25,
        payoutEligibleRewards: 25,
        paidRewards: 5,
        rewardsCurrency: 'EUR',
      },
    });
    vi.mocked(getMemberReferralProgramPreview).mockResolvedValue({
      success: true,
      data: {
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
    });
  });

  it('renders referral stats and dynamic reward summary', async () => {
    render(<ReferralCard />);

    expect(await screen.findByText('Invite Friends & Earn')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://example.test/ref/ABC123')).toBeInTheDocument();
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
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://example.test/ref/ABC123');
    });
    expect(toastSuccess).toHaveBeenCalledWith('Link copied!');
  });

  it('does not load member referral data for agent viewers on the member surface', () => {
    render(<ReferralCard isAgent={true} />);

    expect(getMemberReferralLink).not.toHaveBeenCalled();
    expect(getMemberReferralStats).not.toHaveBeenCalled();
    expect(getMemberReferralProgramPreview).not.toHaveBeenCalled();
    expect(screen.queryByText('Invite Friends & Earn')).not.toBeInTheDocument();
  });

  it('can transition from agent viewer to member viewer without hook-order errors', async () => {
    const { rerender } = render(<ReferralCard isAgent={true} />);

    rerender(<ReferralCard isAgent={false} />);

    expect(await screen.findByText('Invite Friends & Earn')).toBeInTheDocument();
    expect(getMemberReferralLink).toHaveBeenCalled();
    expect(getMemberReferralStats).toHaveBeenCalled();
    expect(getMemberReferralProgramPreview).toHaveBeenCalled();
  });
});
