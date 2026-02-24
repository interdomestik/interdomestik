import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MemberDashboardData } from '@interdomestik/domain-member';
import { MemberDashboardV2 } from './member-dashboard-v2';
import { vi } from 'vitest';

const mockRetentionPulse = vi.fn();
const mockResolveFunnelVariant = vi.fn((enabled: boolean) => (enabled ? 'hero_v2' : 'hero_v1'));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/analytics', () => ({
  FunnelEvents: {
    retentionPulse: mockRetentionPulse,
  },
  resolveFunnelVariant: mockResolveFunnelVariant,
}));

function makeData(overrides?: Partial<MemberDashboardData>): MemberDashboardData {
  return {
    member: {
      id: 'member-1',
      name: 'Test Member',
      membershipNumber: 'M-100',
    },
    claims: [],
    activeClaimId: null,
    supportHref: '/member/help',
    ...overrides,
  };
}

describe('MemberDashboardV2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the locked section order blocks', () => {
    render(<MemberDashboardV2 data={makeData()} locale="en" />);

    expect(screen.getByTestId('member-hero')).toBeInTheDocument();
    expect(screen.getByTestId('member-benefits')).toBeInTheDocument();
    expect(screen.getByTestId('member-quick-actions')).toBeInTheDocument();
    expect(screen.getByTestId('member-how-it-works')).toBeInTheDocument();
    expect(screen.getByTestId('member-claims-module')).toBeInTheDocument();
    expect(screen.getByTestId('member-center')).toBeInTheDocument();
    expect(screen.getByTestId('member-trust-footer')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^qa-/)).toHaveLength(6);
  });

  it('shows locale-aware help contact in hero cta', () => {
    render(<MemberDashboardV2 data={makeData()} locale="mk" tenantId="tenant_mk" />);

    expect(screen.getByTestId('cta-get-help-now')).toHaveAttribute('href', 'tel:+38970337140');
  });

  it('tracks retention pulse with tenant and variant', () => {
    render(<MemberDashboardV2 data={makeData()} locale="en" tenantId="tenant_mk" />);

    expect(mockResolveFunnelVariant).toHaveBeenCalledWith(true);
    expect(mockRetentionPulse).toHaveBeenCalledWith(
      {
        tenantId: 'tenant_mk',
        variant: 'hero_v2',
        locale: 'en',
      },
      {
        surface: 'member_dashboard',
      }
    );
  });

  it('shows collapsed claims module when there is no active claim', () => {
    render(<MemberDashboardV2 data={makeData()} locale="en" />);

    expect(screen.getByTestId('claims-module-state-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('claims-module-state-active')).not.toBeInTheDocument();
  });

  it('shows expanded claims module when there is an active claim', () => {
    const claimId = 'claim-1';
    const data = makeData({
      claims: [
        {
          id: claimId,
          claimNumber: 'CLM-1',
          status: 'draft',
          stageKey: 'draft',
          stageLabel: 'Draft',
          submittedAt: null,
          updatedAt: null,
          requiresMemberAction: false,
        },
      ],
      activeClaimId: claimId,
    });

    render(<MemberDashboardV2 data={data} locale="en" />);

    expect(screen.getByTestId('claims-module-state-active')).toBeInTheDocument();
    expect(screen.queryByTestId('claims-module-state-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('cta-continue-claim')).toBeInTheDocument();
  });
});
