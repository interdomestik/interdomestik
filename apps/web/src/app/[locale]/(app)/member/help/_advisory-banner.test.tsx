import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dateTime: vi.fn(() => 'May 4, 2026, 10:30 AM'),
  getMemberActiveHandoffAdvisory: vi.fn(),
}));

vi.mock('@interdomestik/domain-claims/support-handoffs/advisory', () => ({
  getMemberActiveHandoffAdvisory: mocks.getMemberActiveHandoffAdvisory,
}));

vi.mock('lucide-react', () => ({
  AlertCircle: () => <span aria-hidden="true" />,
}));

vi.mock('next-intl/server', () => ({
  getFormatter: vi.fn(async () => ({
    dateTime: mocks.dateTime,
  })),
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, unknown>) => {
    if (key === 'advisory.claimSpecific') {
      return 'You already have an active support request for this claim.';
    }
    if (key === 'advisory.claimSpecificMeta') {
      return `Status: ${values?.status} · Submitted ${values?.date}`;
    }
    if (key === 'advisory.genericActive') {
      return `You have ${values?.count} active support requests.`;
    }
    if (key === 'advisory.status.accepted') {
      return 'Accepted localized';
    }
    if (key === 'advisory.status.open') {
      return 'Open localized';
    }
    return key;
  }),
}));

import { AdvisoryBanner } from './_advisory-banner';

describe('AdvisoryBanner', () => {
  it('renders the same-claim advisory with localized timestamp metadata', async () => {
    mocks.getMemberActiveHandoffAdvisory.mockResolvedValueOnce({
      activeCount: 2,
      claimMatch: {
        createdAt: '2026-05-04T08:30:00.000Z',
        sourceLabel: 'member_claim_detail',
        status: 'accepted',
        updatedAt: '2026-05-04T09:00:00.000Z',
      },
      linkedClaim: {
        label: 'CLM-1',
        status: 'submitted',
      },
    });

    render(
      await AdvisoryBanner({
        memberId: 'member-1',
        selectedClaim: { id: 'claim-1' },
        tenantId: 'tenant-1',
      })
    );

    expect(mocks.getMemberActiveHandoffAdvisory).toHaveBeenCalledWith({
      claimId: 'claim-1',
      memberId: 'member-1',
      tenantId: 'tenant-1',
    });
    expect(mocks.dateTime).toHaveBeenCalledWith(new Date('2026-05-04T08:30:00.000Z'), {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    expect(screen.getByTestId('member-support-handoff-advisory-claim')).toHaveTextContent(
      'You already have an active support request for this claim.'
    );
    expect(screen.getByTestId('member-support-handoff-advisory-claim')).toHaveTextContent(
      'Status: Accepted localized · Submitted May 4, 2026, 10:30 AM'
    );
  });

  it('renders the generic member advisory when active handoffs exist without a claim match', async () => {
    mocks.getMemberActiveHandoffAdvisory.mockResolvedValueOnce({
      activeCount: 3,
      claimMatch: null,
      linkedClaim: null,
    });

    render(
      await AdvisoryBanner({
        memberId: 'member-1',
        selectedClaim: null,
        tenantId: 'tenant-1',
      })
    );

    expect(mocks.getMemberActiveHandoffAdvisory).toHaveBeenCalledWith({
      claimId: null,
      memberId: 'member-1',
      tenantId: 'tenant-1',
    });
    expect(screen.getByTestId('member-support-handoff-advisory-generic')).toHaveTextContent(
      'You have 3 active support requests.'
    );
  });

  it('renders nothing when the member has no active handoffs', async () => {
    mocks.getMemberActiveHandoffAdvisory.mockResolvedValueOnce({
      activeCount: 0,
      claimMatch: null,
      linkedClaim: null,
    });

    const ui = await AdvisoryBanner({
      memberId: 'member-1',
      selectedClaim: null,
      tenantId: 'tenant-1',
    });

    expect(ui).toBeNull();
  });

  it('fails open when the advisory lookup is unavailable', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.getMemberActiveHandoffAdvisory.mockRejectedValueOnce(new Error('database unavailable'));

    const ui = await AdvisoryBanner({
      memberId: 'member-1',
      selectedClaim: null,
      tenantId: 'tenant-1',
    });

    expect(ui).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      'Member support handoff advisory lookup failed',
      expect.any(Error)
    );

    consoleError.mockRestore();
  });
});
