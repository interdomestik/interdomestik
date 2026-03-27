import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AdminCommissionsPage from './_core.entry';

vi.mock('@/actions/commissions.admin', () => ({
  getAllCommissions: vi.fn(),
  getGlobalCommissionSummary: vi.fn(),
  updateCommissionStatus: vi.fn(),
}));

vi.mock('@/actions/member-referrals', () => ({
  getMemberReferralProgramSettings: vi.fn(),
  listMemberReferralRewards: vi.fn(),
  updateMemberReferralProgramSettings: vi.fn(),
  updateMemberReferralRewardStatus: vi.fn(),
}));

vi.mock('@interdomestik/ui', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
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
  Checkbox: ({
    checked,
    onCheckedChange,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    />
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SelectValue: () => <span>Select value</span>,
}));

vi.mock('lucide-react', () => ({
  Check: () => <span>Check</span>,
  Clock: () => <span>Clock</span>,
  DollarSign: () => <span>Dollar</span>,
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const translations: Record<string, string> = {
      title: 'Commission Management',
      description: 'Review agent commissions, member referral rewards, and program settings.',
      'summary.pending': 'Pending',
      'summary.approved': 'Approved',
      'summary.paid': 'Paid',
      'summary.total_owed': 'Total Owed',
      'summary.items': '{count} items',
      'settings.title': 'Member Referral Program Settings',
      'settings.enable_title': 'Enable member referral rewards',
      'settings.enable_description':
        'Allow members to earn rewards from the first paid membership they refer.',
      'settings.reward_type': 'Reward type',
      'settings.settlement_mode': 'Settlement mode',
      'settings.fixed_reward': 'Fixed reward (cents)',
      'settings.percent_reward': 'Percent reward (bps)',
      'settings.current_reward': 'Current reward: {amount}',
      'settings.payout_threshold': 'Payout threshold (cents)',
      'settings.currency_code': 'Currency code',
      'settings.qualifying_event': 'Qualifying event',
      'settings.fraud_review_title': 'Fraud review required',
      'settings.fraud_review_description':
        'Keep new rewards pending until admin reviews and approves them.',
      'settings.save': 'Save referral settings',
      'reward_types.fixed': 'Fixed amount',
      'reward_types.percent': 'Percent of first payment',
      'settlement_modes.credit_only': 'Credit only',
      'settlement_modes.credit_or_payout': 'Credit or payout',
      'qualifying_event_types.first_paid_membership': 'First paid membership',
      'rewards.title': 'Member Referral Rewards',
      'rewards.reward_label': 'Reward {id} • {amount}',
      'rewards.referrer_label': 'Referrer {id}',
      'rewards.referred_member_label': 'Referred member {id}',
      'commissions.title': 'All Commissions',
      'statuses.pending': 'Pending',
      'statuses.approved': 'Approved',
      'statuses.credited': 'Credited',
      'statuses.paid': 'Paid',
      'statuses.void': 'Void',
      'commission_types.renewal_bonus': 'renewal bonus',
    };

    return Object.entries(values ?? {}).reduce(
      (result, [name, replacement]) => result.replace(`{${name}}`, String(replacement)),
      translations[key] ?? key
    );
  },
}));

describe('Admin commissions page', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const commissionsAdmin = await import('@/actions/commissions.admin');
    vi.mocked(commissionsAdmin.getAllCommissions).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'commission-1',
          agentId: 'agent-1',
          agentName: 'Agent Smith',
          agentEmail: 'agent@example.com',
          memberId: 'member-1',
          memberName: 'Jane Member',
          memberEmail: 'jane@example.com',
          subscriptionId: 'sub-1',
          type: 'renewal',
          amount: '25.00',
          currency: 'EUR',
          status: 'pending',
          earnedAt: new Date('2026-03-20T10:00:00Z'),
          paidAt: null,
          metadata: {},
        },
      ],
    });
    vi.mocked(commissionsAdmin.getGlobalCommissionSummary).mockResolvedValue({
      success: true,
      data: {
        totalPending: 25,
        totalApproved: 10,
        totalPaid: 5,
        pendingCount: 1,
        approvedCount: 1,
        paidCount: 1,
      },
    });

    const memberReferrals = await import('@/actions/member-referrals');
    vi.mocked(memberReferrals.getMemberReferralProgramSettings).mockResolvedValue({
      success: true,
      data: {
        tenantId: 'tenant_ks',
        enabled: true,
        rewardType: 'fixed',
        fixedRewardCents: 750,
        percentRewardBps: null,
        settlementMode: 'credit_or_payout',
        payoutThresholdCents: 10000,
        fraudReviewEnabled: true,
        currencyCode: 'EUR',
        qualifyingEventType: 'first_paid_membership',
      },
    });
    vi.mocked(memberReferrals.listMemberReferralRewards).mockResolvedValue({
      success: true,
      data: [
        {
          id: 'reward-1234',
          tenantId: 'tenant_ks',
          referralId: 'ref-1',
          subscriptionId: 'sub-2',
          referrerMemberId: 'referrer-1',
          referredMemberId: 'referred-1',
          qualifyingEventId: 'txn-1',
          qualifyingEventType: 'first_paid_membership',
          rewardType: 'fixed',
          status: 'pending',
          rewardCents: 750,
          rewardPercentBps: null,
          currencyCode: 'EUR',
          earnedAt: new Date('2026-03-21T10:00:00Z'),
          approvedAt: null,
          creditedAt: null,
          paidAt: null,
          voidedAt: null,
          updatedAt: new Date('2026-03-21T10:00:00Z'),
          metadata: {},
        },
      ],
    });
  });

  it('renders referral settings and rewards alongside commissions', async () => {
    render(<AdminCommissionsPage />);

    expect(await screen.findByText('Commission Management')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Member Referral Program Settings')).toBeInTheDocument();
      expect(screen.getByText('Member Referral Rewards')).toBeInTheDocument();
      expect(screen.getByDisplayValue('750')).toBeInTheDocument();
      expect(screen.getByText(/Reward reward-1/i)).toBeInTheDocument();
      expect(screen.getByText('All Commissions')).toBeInTheDocument();
    });
  });

  it('submits percent referral settings with a null fixed reward payload and no renewal option', async () => {
    const memberReferrals = await import('@/actions/member-referrals');
    vi.mocked(memberReferrals.getMemberReferralProgramSettings).mockResolvedValueOnce({
      success: true,
      data: {
        tenantId: 'tenant_ks',
        enabled: true,
        rewardType: 'percent',
        fixedRewardCents: null,
        percentRewardBps: 500,
        settlementMode: 'credit_only',
        payoutThresholdCents: 10000,
        fraudReviewEnabled: false,
        currencyCode: 'EUR',
        qualifyingEventType: 'first_paid_membership',
      },
    });
    vi.mocked(memberReferrals.updateMemberReferralProgramSettings).mockResolvedValue({
      success: true,
      data: {
        tenantId: 'tenant_ks',
        enabled: true,
        rewardType: 'percent',
        fixedRewardCents: 0,
        percentRewardBps: 500,
        settlementMode: 'credit_only',
        payoutThresholdCents: 10000,
        fraudReviewEnabled: false,
        currencyCode: 'EUR',
        qualifyingEventType: 'first_paid_membership',
      },
    });

    render(<AdminCommissionsPage />);

    expect(await screen.findByText('Commission Management')).toBeInTheDocument();
    expect(screen.queryByText('Renewal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save referral settings' }));

    await waitFor(() => {
      expect(memberReferrals.updateMemberReferralProgramSettings).toHaveBeenCalledWith({
        enabled: true,
        rewardType: 'percent',
        fixedRewardCents: null,
        percentRewardBps: 500,
        settlementMode: 'credit_only',
        payoutThresholdCents: 10000,
        fraudReviewEnabled: false,
        currencyCode: 'EUR',
        qualifyingEventType: 'first_paid_membership',
      });
    });
  });
});
