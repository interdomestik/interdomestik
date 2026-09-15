import { render, screen, within } from '@testing-library/react';
import { deriveCaseCompanionNextStep } from '@interdomestik/domain-claims';
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
  caseCompanionNextStepCardMock: vi.fn((_props: unknown) => (
    <div data-testid="member-claim-case-companion-next-step" />
  )),
}));

vi.mock('@/components/messaging/messaging-panel', () => ({
  MessagingPanel: (props: unknown) => hoisted.messagingPanelMock(props as never),
}));

vi.mock('./ClaimEvidenceUploadDialog', () => ({
  ClaimEvidenceUploadDialog: (props: unknown) =>
    hoisted.claimEvidenceUploadDialogMock(props as never),
}));

vi.mock('./CaseCompanionNextStepCard', () => ({
  CaseCompanionNextStepCard: (props: unknown) => hoisted.caseCompanionNextStepCardMock(props),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href?.toString()} {...props}>
      {children}
    </a>
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
    if (namespace === 'claims.detail.continuity') {
      return (key: string) => {
        const translations: Record<string, string> = {
          backToWorkspace: 'Back to member workspace',
          caseLabel: 'Case',
          sectionNavigation: 'Case sections',
          progress: 'Progress',
          evidence: 'Evidence',
          history: 'History',
          messages: 'Messages',
        };

        return translations[key] || `claims.detail.continuity.${key}`;
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

const memberUser = { id: 'member-1', name: 'Member One', image: null, role: 'member' } as const;

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
    caseCompanionNextStep: deriveCaseCompanionNextStep({ status: 'evaluation' }),
    ...overrides,
    vaultConsentDisplay: overrides.vaultConsentDisplay ?? { kind: 'hidden' },
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
  it('connects the localized header navigation to exactly four stable page targets', () => {
    renderPage();

    expect(screen.getByRole('link', { name: 'Back to member workspace' })).toHaveAttribute(
      'href',
      '/member'
    );
    expect(screen.getByText('Case')).toBeInTheDocument();

    const targetContracts = [
      ['member-claim-detail-progress', 'Progress', 'region'],
      ['member-claim-detail-evidence', 'Evidence', 'region'],
      ['member-claim-detail-history', 'History', 'complementary'],
      ['member-claim-detail-messaging', 'Messages', 'region'],
    ] as const;
    const targets = targetContracts.map(([id, accessibleName, role]) => {
      const target = screen.getByRole(role, { name: accessibleName });
      expect(target).toHaveAttribute('id', id);
      expect(target).toHaveAttribute('aria-label', accessibleName);
      return target;
    });

    expect(document.querySelectorAll('[id^="member-claim-detail-"]')).toHaveLength(4);
    const navigationLinks = within(
      screen.getByRole('navigation', { name: 'Case sections' })
    ).getAllByRole('link');
    expect(navigationLinks.map(link => link.getAttribute('href'))).toEqual(
      targetContracts.map(([id]) => `#${id}`)
    );
    navigationLinks.forEach((link, index) => {
      expect(link).toHaveAccessibleName(targetContracts[index][1]);
    });
    targets.slice(0, -1).forEach((target, index) => {
      expect(target.compareDocumentPosition(targets[index + 1])).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
    });

    const progressTarget = targets[0];
    const progressSummary = within(progressTarget).getByTestId('member-claim-progress-summary');
    const caseCompanion = within(progressTarget).getByTestId(
      'member-claim-case-companion-next-step'
    );
    expect(progressTarget.children).toHaveLength(2);
    expect(progressSummary.compareDocumentPosition(caseCompanion)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(screen.getAllByTestId('member-claim-case-companion-next-step')).toHaveLength(1);
  });

  it('preserves populated member case detail content and action contracts', () => {
    const claimId = 'CASE / 2026 # 001';
    const supportHref = '/member/help?case=1';
    renderPage({
      id: claimId,
      title: 'Delayed flight recovery',
      status: 'evaluation',
      description: 'Flight ID 404 arrived more than four hours late.',
      amount: '550.00',
      currency: 'EUR',
      documents: [
        {
          id: 'document-1',
          name: 'boarding-pass.pdf',
          category: 'evidence',
          createdAt: '2026-04-14T09:00:00',
          fileType: 'application/pdf',
          fileSize: 2048,
        },
      ],
      timeline: [
        {
          id: 'timeline-1',
          date: '2026-04-14T09:00:00',
          statusFrom: 'submitted',
          statusTo: 'evaluation',
          labelKey: 'claims-tracking.status.evaluation',
          note: 'We received your documents.',
          isPublic: true,
        },
        {
          id: 'timeline-2',
          date: '2026-04-15T12:30:00',
          statusFrom: 'evaluation',
          statusTo: 'verification',
          labelKey: 'claims-tracking.status.verification',
          note: 'A specialist started the evidence review.',
          isPublic: true,
        },
      ],
      progressSummary: {
        currentStatusLabelKey: 'claims-tracking.status.evaluation',
        latestUpdateAt: '2026-04-15T12:30:00',
        latestUpdateLabelKey: 'claims-tracking.status.verification',
        latestUpdateNote: 'Your case moved into specialist review.',
        nextStepKey: 'claims-tracking.status.next_step.evaluation',
      },
      memberTrustSummary: {
        state: 'active_handling',
        titleKey: 'claims-tracking.tracking.assurance.title',
        bodyKey: 'claims-tracking.tracking.assurance.body.active_handling',
        stateLabelKey: 'claims-tracking.tracking.assurance.state.active_handling',
        supportHref,
      },
      recoveryDecision: {
        status: 'accepted',
        title: 'Accepted for staff-led recovery',
        description: 'We accepted this matter for staff-led recovery.',
      },
      matterAllowance: {
        allowanceTotal: 2,
        consumedCount: 1,
        remainingCount: 1,
        windowStart: '2026-01-01T00:00:00',
        windowEnd: '2026-12-31T23:59:59',
      },
    });

    expect(screen.getByText(claimId)).toHaveTextContent(claimId);
    expect(screen.getByTestId('ops-status-badge').textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Evaluation'
    );
    expect(screen.getByTestId('member-claim-latest-update-date')).toHaveTextContent(
      'Apr 15, 2026, 12:30 PM'
    );
    expect(
      screen.getByText('Flight ID 404 arrived more than four hours late.')
    ).toBeInTheDocument();
    expect(screen.getByText('550.00 EUR')).toBeInTheDocument();

    const timelineItems = screen.getAllByTestId('ops-timeline-item');
    expect(timelineItems).toHaveLength(2);
    expect(within(timelineItems[0]).getByText('We received your documents.')).toBeInTheDocument();
    expect(
      within(timelineItems[1]).getByText('A specialist started the evidence review.')
    ).toBeInTheDocument();
    expect(timelineItems[0].compareDocumentPosition(timelineItems[1])).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    expect(screen.getByTestId('member-claim-sla-status-phase')).toHaveTextContent(
      'Response timer is running.'
    );
    expect(screen.getByTestId('member-claim-trust-sla-state')).toHaveTextContent(
      'Response timer active'
    );
    expect(screen.getByTestId('member-claim-trust-sla-body')).toHaveTextContent(
      'Your claim is in an active handling stage.'
    );
    expect(screen.getByTestId('member-claim-trust-sla-support-link')).toHaveAttribute(
      'href',
      supportHref
    );
    expect(screen.getByText('Accepted for staff-led recovery')).toBeInTheDocument();
    expect(screen.getByText('We accepted this matter for staff-led recovery.')).toBeInTheDocument();
    expect(screen.getByTestId('member-claim-matter-allowance-used')).toHaveTextContent('1');
    expect(screen.getByTestId('member-claim-matter-allowance-remaining')).toHaveTextContent('1');
    expect(screen.getByTestId('member-claim-matter-allowance-total')).toHaveTextContent('2');
    expect(screen.getAllByTestId('ops-document-row')).toHaveLength(1);
    expect(screen.getByText('boarding-pass.pdf')).toBeInTheDocument();
    expect(screen.getAllByTestId('claim-evidence-upload-dialog')).toHaveLength(2);
    expect(screen.getByTestId('member-claim-latest-update-note')).toHaveTextContent(
      'Your case moved into specialist review.'
    );
    expect(hoisted.messagingPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId,
        allowInternal: false,
        currentUser: expect.objectContaining({ role: 'member' }),
      })
    );
  });

  it('hides optional content and actions for terminal claims', () => {
    renderPage({ status: 'paid' as never, slaPhase: 'not_applicable' });

    expect(screen.queryByTestId('member-claim-recovery-decision')).not.toBeInTheDocument();
    expect(screen.queryByTestId('member-claim-matter-allowance')).not.toBeInTheDocument();
    expect(screen.queryByTestId('member-claim-latest-update-note')).not.toBeInTheDocument();
    expect(screen.queryByTestId('member-claim-sla-status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('claim-evidence-upload-dialog')).toHaveLength(1);
  });

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

  it('uses instant message scrolling while reduced motion is preferred', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'scrollIntoView'
    );
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      renderPage();

      await user.click(screen.getByRole('button', { name: 'Send message' }));

      expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
      expect(screen.getByTestId('member-claim-detail-messaging')).toHaveFocus();
    } finally {
      window.matchMedia = originalMatchMedia;
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
});
