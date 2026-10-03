import { deriveCaseCompanionNextStep } from '@interdomestik/domain-claims';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
vi.unmock('next-intl');
import { deriveClaimSlaPhase } from '@/features/claims/policy';
import { buildMemberClaimTrustSummary } from '@/features/claims/tracking/memberTrustSummary';
import claimsEn from '@/messages/en/claims.json';
import claimsSq from '@/messages/sq/claims.json';
import claimsMk from '@/messages/mk/claims.json';
import claimsSr from '@/messages/sr/claims.json';
import trackingEn from '@/messages/en/claims-tracking.json';
import trackingSq from '@/messages/sq/claims-tracking.json';
import trackingMk from '@/messages/mk/claims-tracking.json';
import trackingSr from '@/messages/sr/claims-tracking.json';
import { MemberClaimDetailOpsPage } from './MemberClaimDetailOpsPage';
import { ClaimInformationRequests, request } from './information-request-component-test-support';

vi.mock('./member-case-messages', () => ({ MemberCaseMessages: () => null }));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href?.toString()} {...props}>
      {children}
    </a>
  ),
}));

const locales = [
  { locale: 'en', tracking: trackingEn, claims: claimsEn },
  { locale: 'sq', tracking: trackingSq, claims: claimsSq },
  { locale: 'mk', tracking: trackingMk, claims: claimsMk },
  { locale: 'sr', tracking: trackingSr, claims: claimsSr },
] as const;

// Task-first reading order of the member case workspace.
const READING_ORDER_SELECTORS = [
  '#member-claim-detail-progress',
  '[data-testid="member-claim-help-summary"]',
  '#member-claim-detail-messaging',
  '#member-claim-detail-evidence',
  '#member-claim-detail-history',
];

function requiredNode(selector: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(selector);
  if (!node) {
    throw new Error(`Expected the mounted member case workspace to render ${selector}`);
  }
  return node;
}

function expectDocumentOrder(nodes: ReadonlyArray<Element>) {
  nodes.slice(0, -1).forEach((node, index) => {
    expect(
      node.compareDocumentPosition(nodes[index + 1]) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
}

function expectTaskFirstReadingOrder() {
  expectDocumentOrder(READING_ORDER_SELECTORS.map(selector => requiredNode(selector)));
}

type TestClaim = Parameters<typeof MemberClaimDetailOpsPage>[0]['claim'];
type Requests = Parameters<typeof ClaimInformationRequests>[0]['requests'];
const requestCases: { name: string; requests: Requests; hasUpload: boolean }[] = [
  { name: 'absent', requests: [], hasUpload: false },
  { name: 'open', requests: [request], hasUpload: true },
  {
    name: 'fulfilled',
    requests: [
      {
        ...request,
        status: 'fulfilled',
        fulfilledAt: '2026-09-18T11:00:00.000Z',
        fulfilledDocumentId: 'document-1',
        progress: 'acknowledged',
        evidence: [
          {
            documentId: 'document-1',
            documentName: 'repair-estimate.pdf',
            submittedAt: '2026-09-17T09:00:00.000Z',
            acknowledgedAt: '2026-09-17T10:00:00.000Z',
          },
        ],
      },
    ],
    hasUpload: false,
  },
];

// Secondary case content that must stay below the member tasks, help and messages.
const secondaryCaseContent: Partial<TestClaim> = {
  recoveryDecision: {
    status: 'accepted',
    title: 'Accepted for staff-led recovery',
    description: 'We accepted this matter for staff-led recovery.',
    declineReasonCode: null,
  },
  matterAllowance: {
    allowanceTotal: 2,
    consumedCount: 1,
    remainingCount: 1,
    windowStart: '2026-01-01T00:00:00',
    windowEnd: '2026-12-31T23:59:59',
  },
};

function claim(
  status: TestClaim['status'] = 'verification',
  overrides: Partial<TestClaim> = {}
): TestClaim {
  const id = 'claim-verify/1';
  const slaPhase = deriveClaimSlaPhase(status);
  return {
    id,
    title: 'Verification Claim',
    status,
    slaPhase,
    statusLabelKey: 'claims-tracking.status.' + status,
    createdAt: new Date('2026-03-14T10:00:00.000Z'),
    updatedAt: null,
    description: 'Synthetic test case',
    amount: '0',
    currency: 'EUR',
    canShare: false,
    memberTrustSummary: buildMemberClaimTrustSummary({ claimId: id, status, slaPhase }),
    documents: [],
    timeline: [],
    progressSummary: {
      currentStatusLabelKey: 'claims-tracking.status.' + status,
      latestUpdateAt: new Date('2026-03-14T10:00:00.000Z'),
      latestUpdateLabelKey: 'claims-tracking.status.' + status,
      latestUpdateNote: null,
      nextStepKey: 'claims-tracking.status.next_step.' + status,
    },
    caseCompanionNextStep: deriveCaseCompanionNextStep({ status }),
    vaultConsentDisplay: { kind: 'hidden' },
    ...overrides,
  };
}

const memberUser = { id: 'member-1', name: 'Member One', image: null, role: 'member' };
function renderAssurance(
  locale: (typeof locales)[number],
  requests: Requests,
  status?: TestClaim['status'],
  overrides: Partial<TestClaim> = {}
) {
  const detail = claim(status, overrides);
  return render(
    <NextIntlClientProvider
      locale={locale.locale}
      messages={{ ...locale.tracking, ...locale.claims }}
      timeZone="UTC"
    >
      <MemberClaimDetailOpsPage
        currentUser={memberUser}
        claim={detail}
        informationRequests={
          <ClaimInformationRequests audience="member" claimId={detail.id} requests={requests} />
        }
      />
    </NextIntlClientProvider>
  );
}

describe('neutral mounted verification handling assurance', () => {
  it.each(
    locales.flatMap(locale => requestCases.map(requestCase => ({ ...locale, ...requestCase })))
  )('keeps real assurance copy neutral for $name requests in $locale', locale => {
    renderAssurance(locale, locale.requests);
    const copy = locale.tracking['claims-tracking'].tracking.assurance;
    const panel = screen.getByTestId('member-claim-trust-sla-panel');
    expect(within(panel).getByTestId('member-claim-trust-sla-state')).toHaveTextContent(
      copy.state.verification_in_progress
    );
    expect(within(panel).getByTestId('member-claim-trust-sla-body')).toHaveTextContent(
      copy.body.verification_in_progress
    );
    expect(panel).not.toHaveTextContent(copy.state.member_action_required);
    expect(panel).not.toHaveTextContent(copy.body.member_action_required);
    expect(panel).not.toHaveTextContent('verification_in_progress');
    expect(within(panel).getByTestId('member-claim-trust-sla-support-link')).toHaveAttribute(
      'href',
      '/member/help?claimId=claim-verify%2F1&source=member_claim_detail'
    );

    const slaCopy = locale.tracking['claims-tracking'].tracking.sla;
    const slaCard = screen.getByTestId('member-claim-sla-status');
    expect(within(slaCard).getByTestId('member-claim-sla-status-phase')).toHaveTextContent(
      slaCopy.verification
    );
    expect(slaCard).not.toHaveTextContent(slaCopy.incomplete);

    expectTaskFirstReadingOrder();

    const requestCopy = locale.claims.claims.informationRequests;
    if (locale.hasUpload) {
      const requestCard = screen.getByTestId('claim-information-request');
      expect(within(requestCard).getByRole('button', { name: requestCopy.upload })).toBeVisible();
      expect(within(requestCard).getByTestId('information-request-next-actor')).toHaveTextContent(
        requestCopy.nextActor.member
      );
      expect(within(requestCard).getByTestId('information-request-next-action')).toHaveTextContent(
        requestCopy.nextAction.uploadEvidence
      );
    } else {
      expect(screen.queryByRole('button', { name: requestCopy.upload })).not.toBeInTheDocument();
      if (locale.name === 'fulfilled') {
        expect(screen.getByTestId('information-request-status')).toHaveTextContent(
          requestCopy.status.fulfilled
        );
      } else {
        expect(screen.queryByTestId('claim-information-requests')).not.toBeInTheDocument();
      }
    }
  });

  it('preserves actual draft member-action presentation', () => {
    renderAssurance(locales[0], [], 'draft');
    const copy = trackingEn['claims-tracking'].tracking.assurance;
    const panel = screen.getByTestId('member-claim-trust-sla-panel');
    expect(within(panel).getByTestId('member-claim-trust-sla-state')).toHaveTextContent(
      copy.state.member_action_required
    );
    expect(within(panel).getByTestId('member-claim-trust-sla-body')).toHaveTextContent(
      copy.body.member_action_required
    );
    // Draft carries no SLA threshold, so policy derives not_applicable and the page omits the card.
    expect(deriveClaimSlaPhase('draft')).toBe('not_applicable');
    expect(screen.queryByTestId('member-claim-sla-status')).not.toBeInTheDocument();
  });
});

describe('real member case workspace composition', () => {
  it('reads tasks, help and messages before secondary case detail', () => {
    renderAssurance(locales[0], [], 'verification', secondaryCaseContent);
    const progress = requiredNode('#member-claim-detail-progress');
    const help = screen.getByTestId('member-claim-help-summary');
    expectDocumentOrder([
      within(progress).getByTestId('member-claim-progress-summary'),
      within(progress).getByTestId('member-claim-case-companion-next-step'),
      help,
      requiredNode('#member-claim-detail-messaging'),
      screen.getByTestId('member-claim-recovery-decision'),
      screen.getByTestId('member-claim-matter-allowance'),
      screen.getByTestId('member-claim-case-details'),
      requiredNode('#member-claim-detail-evidence'),
      requiredNode('#member-claim-detail-history'),
    ]);
    expectDocumentOrder([
      within(help).getByTestId('member-claim-sla-status'),
      within(help).getByTestId('member-claim-trust-sla-panel'),
    ]);
    expect(within(help).getByTestId('member-claim-trust-sla-support-link')).toBeVisible();
  });

  it('keeps requested information below case identity inside the progress section', () => {
    renderAssurance(locales[0], [request]);
    const progress = requiredNode('#member-claim-detail-progress');
    expectDocumentOrder([
      screen.getByTestId('ops-status-badge'),
      within(progress).getByTestId('member-claim-progress-summary'),
      within(progress).getByTestId('claim-information-request'),
    ]);
  });
});
