import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  claimEvidenceUploadDialogMock: vi.fn(
    ({ claimId, trigger }: { claimId: string; trigger: React.ReactNode }) => (
      <div data-testid="claim-evidence-upload-dialog" data-claim-id={claimId}>
        {trigger}
      </div>
    )
  ),
}));

vi.mock('@/components/messaging/messaging-panel', () => ({
  MessagingPanel: (props: unknown) => hoisted.messagingPanelMock(props as never),
}));

vi.mock('./ClaimEvidenceUploadDialog', () => ({
  ClaimEvidenceUploadDialog: (props: unknown) =>
    hoisted.claimEvidenceUploadDialogMock(props as never),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: (namespace?: string) => {
    if (namespace === 'claims-tracking.status') {
      return (key: string) => {
        if (key === 'evaluation') return 'Evaluation';
        if (key === 'verification') return 'Verification';
        return `claims-tracking.status.${key}`;
      };
    }
    if (namespace === 'claims-tracking.status.next_step') {
      return (key: string) => {
        const translations: Record<string, string> = {
          evaluation: 'Our experts are evaluating the damages and liability.',
          verification: 'We are verifying the provided documents and evidence.',
        };
        return translations[key] || `claims-tracking.status.next_step.${key}`;
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
    if (namespace === 'claims-tracking.tracking.assurance') {
      return (key: string) => {
        const translations: Record<string, string> = {
          title: 'Handling assurance',
          stateLabel: 'SLA state',
          latestUpdateLabel: 'Latest public update',
          supportLabel: 'Need help?',
          supportCta: 'Contact support',
          'state.member_action_required': 'Waiting for your action',
          'state.active_handling': 'Response timer active',
          'state.completed': 'Final outcome published',
          'state.outside_operational_sla': 'No active response timer',
          'body.member_action_required':
            'We need your information before the response timer can continue.',
          'body.active_handling': 'Your claim is in an active handling stage.',
          'body.completed': 'This claim has a final outcome.',
          'body.outside_operational_sla':
            'This stage does not have an active operational response timer.',
        };
        return translations[key] || `claims-tracking.tracking.assurance.${key}`;
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
          'claimsPro.actions.sendMessage': 'Send message',
          'detail.progress.title': 'Progress summary',
          'detail.progress.currentState': 'Current state',
          'detail.progress.latestUpdate': 'Latest update',
          'detail.progress.nextAction': 'Expected next action',
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
    memberTrustSummary: {
      state: 'active_handling',
      titleKey: 'claims-tracking.tracking.assurance.title',
      bodyKey: 'claims-tracking.tracking.assurance.body.active_handling',
      stateLabelKey: 'claims-tracking.tracking.assurance.state.active_handling',
      supportHref: '/member/help',
    },
    documents: [],
    timeline: [],
    progressSummary: {
      currentStatusLabelKey: 'claims-tracking.status.evaluation',
      latestUpdateAt: now,
      latestUpdateLabelKey: 'claims-tracking.status.evaluation',
      latestUpdateNote: null,
      nextStepKey: 'claims-tracking.status.next_step.evaluation',
    },
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

  it('shows member trust and SLA clarity when the claim is waiting on member information', () => {
    renderPage({
      id: 'claim-2',
      title: 'Verification Claim',
      status: 'verification',
      slaPhase: 'incomplete',
      statusLabelKey: 'claims-tracking.status.verification',
      description: 'Need more documents',
      memberTrustSummary: {
        state: 'member_action_required',
        titleKey: 'claims-tracking.tracking.assurance.title',
        bodyKey: 'claims-tracking.tracking.assurance.body.member_action_required',
        stateLabelKey: 'claims-tracking.tracking.assurance.state.member_action_required',
        supportHref: '/member/help',
      },
    });

    expect(screen.getByTestId('member-claim-trust-sla-panel')).toBeInTheDocument();
    expect(screen.getByTestId('member-claim-sla-status')).toBeInTheDocument();
    expect(screen.getByText('SLA Status')).toBeInTheDocument();
    expect(screen.getByTestId('member-claim-sla-status-phase')).toHaveTextContent(
      'Waiting for your information before the SLA starts.'
    );
    expect(screen.getByText('Handling assurance')).toBeInTheDocument();
    expect(screen.getByTestId('member-claim-trust-sla-state')).toHaveTextContent(
      'Waiting for your action'
    );
    expect(screen.getByTestId('member-claim-trust-sla-body')).toHaveTextContent(
      'We need your information before the response timer can continue.'
    );
    expect(screen.getByRole('link', { name: /Contact support/ })).toHaveAttribute(
      'href',
      '/member/help'
    );
  });

  it('shows active handling assurance with the latest public update date', () => {
    renderPage({
      progressSummary: {
        currentStatusLabelKey: 'claims-tracking.status.evaluation',
        latestUpdateAt: '2026-04-15T12:30:00.000Z',
        latestUpdateLabelKey: 'claims-tracking.status.evaluation',
        latestUpdateNote: null,
        nextStepKey: 'claims-tracking.status.next_step.evaluation',
      },
    });

    expect(screen.getByTestId('member-claim-trust-sla-state')).toHaveTextContent(
      'Response timer active'
    );
    expect(screen.getByText('SLA Status')).toBeInTheDocument();
    expect(screen.getByTestId('member-claim-sla-status-phase')).toHaveTextContent(
      'Response timer is running.'
    );
    expect(screen.getByTestId('member-claim-trust-sla-latest')).toBeInTheDocument();
    expect(screen.getByTestId('member-claim-trust-sla-body')).toHaveTextContent(
      'Your claim is in an active handling stage.'
    );
  });

  it('shows current state, latest public update, and expected next action', () => {
    renderPage({
      progressSummary: {
        currentStatusLabelKey: 'claims-tracking.status.verification',
        latestUpdateAt: '2026-04-15T12:30:00.000Z',
        latestUpdateLabelKey: 'claims-tracking.status.evaluation',
        latestUpdateNote: 'We reviewed your boarding pass and moved the case forward.',
        nextStepKey: 'claims-tracking.status.next_step.evaluation',
      },
    });

    expect(screen.getByTestId('member-claim-progress-summary')).toBeInTheDocument();
    expect(screen.getByText('Progress summary')).toBeInTheDocument();
    expect(screen.getByText('Current state')).toBeInTheDocument();
    expect(screen.getByTestId('member-claim-current-state')).toHaveTextContent('Verification');
    expect(screen.getByTestId('member-claim-latest-update')).toHaveTextContent('Evaluation');
    expect(screen.getByTestId('member-claim-latest-update-note')).toHaveTextContent(
      'We reviewed your boarding pass and moved the case forward.'
    );
    expect(screen.getByTestId('member-claim-expected-next-action')).toHaveTextContent(
      'Our experts are evaluating the damages and liability.'
    );
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
    expect(screen.queryByTestId('member-claim-sla-status')).not.toBeInTheDocument();
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

  it('wires both member upload evidence triggers through the shared upload dialog', () => {
    renderPage({
      id: 'claim-6',
      title: 'Upload Claim',
      description: 'Claim details',
      amount: '120',
    });

    expect(screen.getAllByTestId('claim-evidence-upload-dialog')).toHaveLength(2);
    expect(hoisted.claimEvidenceUploadDialogMock).toHaveBeenCalledTimes(2);
    expect(hoisted.claimEvidenceUploadDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-6',
        trigger: expect.anything(),
      })
    );
  });

  it('scrolls to the existing messaging panel when the header send message action is used', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollIntoView'
    );

    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      renderPage({
        id: 'claim-7',
        title: 'Message Claim',
        description: 'Claim details',
        amount: '120',
      });

      await user.click(screen.getByRole('button', { name: 'Send message' }));

      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
      expect(screen.getByTestId('member-claim-detail-messaging')).toHaveFocus();
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
      } else {
        Reflect.deleteProperty(
          HTMLElement.prototype as unknown as Record<string, unknown>,
          'scrollIntoView'
        );
      }
    }
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
