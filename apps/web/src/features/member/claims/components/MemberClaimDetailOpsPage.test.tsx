import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemberClaimDetailOpsPage } from './MemberClaimDetailOpsPage';

const hoisted = vi.hoisted(() => ({
  messagingPanelMock: vi.fn(
    ({
      allowInternal,
      claimId,
      currentUser,
    }: {
      allowInternal?: boolean;
      claimId: string;
      currentUser: { role: string };
    }) => (
      <div
        data-testid="member-claim-messaging"
        data-allow-internal={String(Boolean(allowInternal))}
        data-claim-id={claimId}
        data-role={currentUser.role}
      />
    )
  ),
}));

vi.mock('@/components/messaging/messaging-panel', () => ({
  MessagingPanel: (props: unknown) => hoisted.messagingPanelMock(props as never),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace?: string) => {
    if (namespace === 'claims-tracking.status') {
      return (key: string) => {
        if (key === 'evaluation') return 'Evaluation';
        return `claims-tracking.status.${key}`;
      };
    }
    if (namespace === 'claims-tracking.tracking.sla') {
      return (key: string) => {
        const translations: Record<string, string> = {
          title: 'SLA Status',
          running: 'Response timer is running.',
          incomplete: 'Waiting for your information before the SLA starts.',
        };
        return translations[key] || `claims-tracking.tracking.sla.${key}`;
      };
    }
    if (namespace === 'claims') {
      return (key: string) => {
        const translations: Record<string, string> = {
          'detail.matterAllowance.title': 'Matter allowance',
          'detail.matterAllowance.used': 'Used this year',
          'detail.matterAllowance.remaining': 'Remaining this year',
          'detail.matterAllowance.total': 'Plan allowance',
          'detail.caseDetails': 'Case details',
          'detail.evidence': 'Evidence',
          'detail.documentsEmpty': 'No documents uploaded yet',
          'detail.viewDocument': 'View document',
          'timeline.title': 'Timeline',
          'timeline.empty': 'No updates yet',
          'claimsPro.actions.uploadEvidence': 'Upload evidence',
          'table.amount': 'Amount',
        };

        return translations[key] || `claims.${key}`;
      };
    }
    if (namespace === 'claims.status') {
      return (key: string) => {
        const translations: Record<string, string> = {
          evaluation: 'Evaluation',
          verification: 'Verification',
          negotiation: 'Negotiation',
        };

        return translations[key] || `claims.status.${key}`;
      };
    }
    return (key: string) => (namespace ? `${namespace}.${key}` : key);
  },
}));

type TestClaim = Parameters<typeof MemberClaimDetailOpsPage>[0]['claim'];

const memberUser = {
  id: 'member-1',
  name: 'Member One',
  image: null,
  role: 'member',
} as const;

const testNow = new Date('2026-03-14T10:00:00.000Z');

function buildClaim(now: Date, overrides: Partial<TestClaim> = {}): TestClaim {
  return {
    id: 'claim-1',
    title: 'Test Claim',
    status: 'evaluation',
    slaPhase: 'running',
    statusLabelKey: 'claims-tracking.status.evaluation',
    createdAt: now,
    updatedAt: null,
    description: 'desc',
    amount: '0',
    currency: 'EUR',
    canShare: false,
    documents: [],
    timeline: [],
    ...overrides,
  };
}

function renderPage(claimOverrides: Partial<TestClaim> = {}) {
  render(
    <MemberClaimDetailOpsPage
      currentUser={memberUser}
      claim={buildClaim(testNow, claimOverrides)}
    />
  );
}

describe('MemberClaimDetailOpsPage', () => {
  it('translates claim timeline status keys without using the claims namespace', () => {
    renderPage({
      timeline: [
        {
          id: 't1',
          date: testNow,
          statusFrom: 'submitted',
          statusTo: 'evaluation',
          labelKey: 'claims-tracking.status.evaluation',
          note: 'note',
          isPublic: true,
        },
      ],
    });

    // If the old bug regresses, we'd render "claims.claims-tracking.status.evaluation".
    expect(screen.getAllByText('Evaluation').length).toBeGreaterThan(0);
  });

  it('shows the member-facing SLA phase when the claim is waiting on member information', () => {
    renderPage({
      id: 'claim-2',
      title: 'Verification Claim',
      status: 'verification',
      slaPhase: 'incomplete',
      statusLabelKey: 'claims-tracking.status.verification',
      description: 'Need more documents',
    });

    expect(screen.getByText('SLA Status')).toBeInTheDocument();
    expect(
      screen.getByText('Waiting for your information before the SLA starts.')
    ).toBeInTheDocument();
  });

  it('shows annual matter usage and remaining allowance when the snapshot is available', () => {
    renderPage({
      id: 'claim-3',
      title: 'Negotiation Claim',
      status: 'negotiation',
      slaPhase: 'not_applicable',
      statusLabelKey: 'claims-tracking.status.negotiation',
      description: 'Recovery in progress',
      amount: '550',
      matterAllowance: {
        allowanceTotal: 2,
        consumedCount: 1,
        remainingCount: 1,
        windowStart: testNow,
        windowEnd: testNow,
      },
    });

    expect(screen.getByText('Matter allowance')).toBeInTheDocument();
    expect(screen.getByText('Used this year')).toBeInTheDocument();
    expect(screen.getByText('Remaining this year')).toBeInTheDocument();
    expect(screen.getByText('Plan allowance')).toBeInTheDocument();
    expect(screen.getAllByText('1')).toHaveLength(2);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders claim messaging on the canonical member detail surface without internal-note controls', () => {
    renderPage({
      id: 'claim-4',
      title: 'Messaging Claim',
      description: 'Claim details',
      amount: '120',
    });

    expect(screen.getByTestId('member-claim-messaging')).toBeInTheDocument();
    expect(hoisted.messagingPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-4',
        allowInternal: false,
        currentUser: expect.objectContaining({
          role: 'member',
        }),
      })
    );
  });

  it('shows a member-safe recovery decision summary when staff accept the matter', () => {
    renderPage({
      id: 'claim-5',
      title: 'Accepted Claim',
      status: 'evaluation',
      description: 'Waiting for staff-led recovery to start',
      amount: '550',
      ...({
        recoveryDecision: {
          status: 'accepted',
          title: 'Accepted for staff-led recovery',
          description: 'We accepted this matter for staff-led recovery.',
        },
      } as unknown as Partial<TestClaim>),
    });

    expect(screen.getByText('Accepted for staff-led recovery')).toBeInTheDocument();
    expect(screen.getByText('We accepted this matter for staff-led recovery.')).toBeInTheDocument();
  });
});
