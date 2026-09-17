import { deriveCaseCompanionNextStep } from '@interdomestik/domain-claims';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemberClaimDetailOpsPage } from './MemberClaimDetailOpsPage';

type MessagingMockProps = {
  allowInternal?: boolean;
  claimId: string;
  currentUser: { role: string };
};
type UploadMockProps = { claimId: string; trigger: React.ReactNode };

// prettier-ignore
const hoisted = vi.hoisted(() => ({
  messagingPanelMock: vi.fn(({ allowInternal, claimId, currentUser }: MessagingMockProps) => (
    <div data-testid="member-claim-messaging" data-allow-internal={String(Boolean(allowInternal))}
      data-claim-id={claimId} data-role={currentUser.role} />
  )),
  claimEvidenceUploadDialogMock: vi.fn(({ claimId, trigger }: UploadMockProps) => (
    <div data-testid="claim-evidence-upload-dialog" data-claim-id={claimId}>{trigger}</div>
  )),
  caseCompanionNextStepCardMock: vi.fn(() => <div data-testid="member-claim-case-companion-next-step" />),
  translations: Object.fromEntries([
    'claims-tracking.status.evaluation=Evaluation|claims-tracking.status.verification=Verification',
    'claims-tracking.tracking.sla.title=SLA Status|claims-tracking.tracking.sla.running=Response timer is running.|claims-tracking.tracking.sla.incomplete=Waiting for your information before the SLA starts.',
    'claims-tracking.tracking.assurance.title=Handling assurance|claims-tracking.tracking.assurance.stateLabel=SLA state|claims-tracking.tracking.assurance.latestUpdateLabel=Latest public update|claims-tracking.tracking.assurance.supportLabel=Need help?|claims-tracking.tracking.assurance.supportCta=Contact support',
    'claims-tracking.tracking.assurance.state.member_action_required=Waiting for your action|claims-tracking.tracking.assurance.state.active_handling=Response timer active',
    'claims-tracking.tracking.assurance.body.member_action_required=We need your information before the response timer can continue.|claims-tracking.tracking.assurance.body.active_handling=Your claim is in an active handling stage.',
    'claims.detail.continuity.backToWorkspace=Back to member workspace|claims.detail.continuity.caseLabel=Case|claims.detail.continuity.sectionNavigation=Case sections|claims.detail.continuity.progress=Progress|claims.detail.continuity.evidence=Evidence|claims.detail.continuity.history=History|claims.detail.continuity.messages=Messages',
    'claims.detail.matterAllowance.title=Matter allowance|claims.detail.matterAllowance.used=Used this year|claims.detail.matterAllowance.remaining=Remaining this year|claims.detail.matterAllowance.total=Plan allowance|claims.detail.caseDetails=Case details|claims.detail.evidence=Evidence|claims.detail.documentsEmpty=No documents uploaded yet|claims.detail.viewDocument=View document',
    'claims.timeline.title=Timeline|claims.timeline.empty=No updates yet|claims.claimsPro.actions.uploadEvidence=Upload evidence|claims.claimsPro.actions.sendMessage=Send message|claims.detail.progress.title=Progress summary|claims.detail.progress.currentState=Current state|claims.detail.progress.latestUpdate=Latest update|claims.table.amount=Amount',
    'claims.status.evaluation=Evaluation|claims.status.verification=Verification',
  ].flatMap(group => group.split('|')).map(entry => entry.split('='))) as Record<string, string>,
}));

vi.mock('@/components/messaging/messaging-panel', () => ({
  MessagingPanel: (props: unknown) => hoisted.messagingPanelMock(props as never),
}));
vi.mock('./ClaimEvidenceUploadDialog', () => ({
  ClaimEvidenceUploadDialog: (props: unknown) =>
    hoisted.claimEvidenceUploadDialogMock(props as never),
}));
vi.mock('./CaseCompanionNextStepCard', () => ({
  CaseCompanionNextStepCard: () => hoisted.caseCompanionNextStepCardMock(),
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
  useTranslations: (namespace?: string) => (key: string) => {
    const fullKey = namespace ? `${namespace}.${key}` : key;
    return hoisted.translations[fullKey] ?? fullKey;
  },
}));

type TestClaim = Parameters<typeof MemberClaimDetailOpsPage>[0]['claim'];
type TimelineItem = TestClaim['timeline'][number];
const memberUser = { id: 'member-1', name: 'Member One', image: null, role: 'member' } as const;
const testNow = new Date('2026-03-14T10:00:00.000Z');

function timelineItem(
  id: string,
  date: TimelineItem['date'],
  statusFrom: TimelineItem['statusFrom'],
  statusTo: TimelineItem['statusTo'],
  labelKey: string,
  note: string
): TimelineItem {
  return { id, date, statusFrom, statusTo, labelKey, note, isPublic: true };
}

// prettier-ignore
function buildClaim(overrides: Partial<TestClaim> = {}): TestClaim {
  return {
    id: 'claim-1', title: 'Test Claim', status: 'evaluation', slaPhase: 'running',
    statusLabelKey: 'claims-tracking.status.evaluation', createdAt: testNow, updatedAt: null,
    description: 'desc', amount: '0', currency: 'EUR', canShare: false,
    memberTrustSummary: {
      state: 'active_handling', titleKey: 'claims-tracking.tracking.assurance.title',
      bodyKey: 'claims-tracking.tracking.assurance.body.active_handling',
      stateLabelKey: 'claims-tracking.tracking.assurance.state.active_handling', supportHref: '/member/help',
    },
    documents: [], timeline: [],
    progressSummary: {
      currentStatusLabelKey: 'claims-tracking.status.evaluation', latestUpdateAt: testNow,
      latestUpdateLabelKey: 'claims-tracking.status.evaluation', latestUpdateNote: null,
      nextStepKey: 'claims-tracking.status.next_step.evaluation',
    },
    caseCompanionNextStep: deriveCaseCompanionNextStep({ status: 'evaluation' }), ...overrides,
    vaultConsentDisplay: overrides.vaultConsentDisplay ?? { kind: 'hidden' },
  };
}

function renderPage(overrides: Partial<TestClaim> = {}) {
  render(<MemberClaimDetailOpsPage currentUser={memberUser} claim={buildClaim(overrides)} />);
}
it('keeps requested information below case identity inside the progress section', () => {
  render(
    <MemberClaimDetailOpsPage
      currentUser={memberUser}
      claim={buildClaim()}
      informationRequests={<p>Requested repair estimate</p>}
    />
  );
  const request = within(screen.getByRole('region', { name: 'Progress' })).getByText(
    'Requested repair estimate'
  );
  const back = screen.getByRole('link', { name: 'Back to member workspace' });
  expect(back.compareDocumentPosition(request) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
function expectTestIdText(contracts: ReadonlyArray<readonly [string, string]>) {
  contracts.forEach(([id, text]) => expect(screen.getByTestId(id)).toHaveTextContent(text));
}
function restoreProperty(target: object, key: PropertyKey, descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

// prettier-ignore
async function expectMessageScroll(
  reducedMotion: boolean, behavior: ScrollBehavior, overrides: Partial<TestClaim> = {}
) {
  const user = userEvent.setup();
  const scrollIntoView = vi.fn();
  const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  const mediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  window.matchMedia = vi.fn((query: string) => ({
    matches: reducedMotion && query === '(prefers-reduced-motion: reduce)', media: query,
    onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
    removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) as typeof window.matchMedia;
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
  try {
    renderPage(overrides);
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior, block: 'start' });
    expect(screen.getByTestId('member-claim-detail-messaging')).toHaveFocus();
  } finally {
    restoreProperty(window, 'matchMedia', mediaDescriptor);
    restoreProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor);
  }
}

// prettier-ignore
describe('MemberClaimDetailOpsPage', () => {
  it('connects the localized header navigation to exactly four stable page targets', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Back to member workspace' })).toHaveAttribute('href', '/member');
    expect(screen.getByText('Case')).toBeInTheDocument();
    const contracts = [
      ['member-claim-detail-progress', 'Progress', 'region'],
      ['member-claim-detail-evidence', 'Evidence', 'region'],
      ['member-claim-detail-history', 'History', 'complementary'],
      ['member-claim-detail-messaging', 'Messages', 'region'],
    ] as const;
    const targets = contracts.map(([id, name, role]) => {
      const target = screen.getByRole(role, { name });
      expect(target).toHaveAttribute('id', id);
      expect(target).toHaveAttribute('aria-label', name);
      return target;
    });
    expect(document.querySelectorAll('[id^="member-claim-detail-"]')).toHaveLength(4);
    const links = within(screen.getByRole('navigation', { name: 'Case sections' })).getAllByRole('link');
    expect(links.map(link => link.getAttribute('href'))).toEqual(contracts.map(([id]) => `#${id}`));
    links.forEach((link, index) => expect(link).toHaveAccessibleName(contracts[index][1]));
    targets.slice(0, -1).forEach((target, index) => {
      expect(target.compareDocumentPosition(targets[index + 1])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });
    const progress = targets[0];
    const summary = within(progress).getByTestId('member-claim-progress-summary');
    const companion = within(progress).getByTestId('member-claim-case-companion-next-step');
    expect(progress.children).toHaveLength(2);
    expect(summary.compareDocumentPosition(companion)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getAllByTestId('member-claim-case-companion-next-step')).toHaveLength(1);
  });

  it('preserves populated member case detail content and action contracts', () => {
    const claimId = 'CASE / 2026 # 001';
    const supportHref = '/member/help?case=1';
    renderPage({
      id: claimId, title: 'Delayed flight recovery', status: 'evaluation',
      description: 'Flight ID 404 arrived more than four hours late.', amount: '550.00', currency: 'EUR',
      documents: [{ id: 'document-1', name: 'boarding-pass.pdf', category: 'evidence',
        createdAt: '2026-04-14T09:00:00', fileType: 'application/pdf', fileSize: 2048 }],
      timeline: [
        timelineItem('timeline-1', '2026-04-14T09:00:00', 'submitted', 'evaluation',
          'claims-tracking.status.evaluation', 'We received your documents.'),
        timelineItem('timeline-2', '2026-04-15T12:30:00', 'evaluation', 'verification',
          'claims-tracking.status.verification', 'A specialist started the evidence review.'),
      ],
      progressSummary: {
        currentStatusLabelKey: 'claims-tracking.status.evaluation',
        latestUpdateAt: '2026-04-15T12:30:00', latestUpdateLabelKey: 'claims-tracking.status.verification',
        latestUpdateNote: 'Your case moved into specialist review.',
        nextStepKey: 'claims-tracking.status.next_step.evaluation',
      },
      memberTrustSummary: {
        state: 'active_handling', titleKey: 'claims-tracking.tracking.assurance.title',
        bodyKey: 'claims-tracking.tracking.assurance.body.active_handling',
        stateLabelKey: 'claims-tracking.tracking.assurance.state.active_handling', supportHref,
      },
      recoveryDecision: { status: 'accepted', title: 'Accepted for staff-led recovery',
        description: 'We accepted this matter for staff-led recovery.' },
      matterAllowance: { allowanceTotal: 2, consumedCount: 1, remainingCount: 1,
        windowStart: '2026-01-01T00:00:00', windowEnd: '2026-12-31T23:59:59' },
    });
    expect(screen.getByText(claimId)).toHaveTextContent(claimId);
    expect(screen.getByTestId('ops-status-badge').textContent?.replace(/\s+/g, ' ').trim()).toBe('Evaluation');
    expectTestIdText([
      ['member-claim-current-state', 'Evaluation'],
      ['member-claim-latest-update', 'Verification'],
      ['member-claim-latest-update-date', 'Apr 15, 2026, 12:30 PM'],
      ['member-claim-sla-status-phase', 'Response timer is running.'],
      ['member-claim-trust-sla-state', 'Response timer active'],
      ['member-claim-trust-sla-latest', 'Apr 15, 2026, 12:30 PM'],
      ['member-claim-trust-sla-body', 'Your claim is in an active handling stage.'],
      ['member-claim-matter-allowance-used', '1'], ['member-claim-matter-allowance-remaining', '1'],
      ['member-claim-matter-allowance-total', '2'],
      ['member-claim-latest-update-note', 'Your case moved into specialist review.'],
    ]);
    ['Flight ID 404 arrived more than four hours late.', '550.00 EUR',
      'Accepted for staff-led recovery', 'We accepted this matter for staff-led recovery.',
      'boarding-pass.pdf'].forEach(text => expect(screen.getByText(text)).toBeInTheDocument());
    const timeline = screen.getAllByTestId('ops-timeline-item');
    expect(timeline).toHaveLength(2);
    ['We received your documents.', 'A specialist started the evidence review.'].forEach((note, index) => {
      expect(within(timeline[index]).getByText(note)).toBeInTheDocument();
    });
    expect(timeline[0].compareDocumentPosition(timeline[1])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByTestId('member-claim-trust-sla-support-link')).toHaveAttribute('href', supportHref);
    expect(screen.getAllByTestId('ops-document-row')).toHaveLength(1);
    const uploads = screen.getAllByTestId('claim-evidence-upload-dialog');
    expect(uploads).toHaveLength(2);
    uploads.forEach(upload => expect(upload).toHaveAttribute('data-claim-id', claimId));
    expect(hoisted.messagingPanelMock).toHaveBeenCalledWith(expect.objectContaining({
      claimId, allowInternal: false, currentUser: expect.objectContaining({ role: 'member' }),
    }));
  });

  it('hides optional content and actions for terminal claims', () => {
    renderPage({ status: 'paid' as never, slaPhase: 'not_applicable' });
    ['member-claim-recovery-decision', 'member-claim-matter-allowance',
      'member-claim-latest-update-note', 'member-claim-sla-status'].forEach(id => {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('claim-evidence-upload-dialog')).toHaveLength(1);
  });

  it('translates claim timeline status keys without using the claims namespace', () => {
    renderPage({ timeline: [timelineItem('t1', testNow, 'submitted', 'evaluation',
      'claims-tracking.status.evaluation', 'note')] });
    expect(screen.getAllByText('Evaluation').length).toBeGreaterThan(0);
  });

  it('shows member trust and SLA clarity when the claim is waiting on member information', () => {
    renderPage({
      id: 'claim-2', title: 'Verification Claim', status: 'verification', slaPhase: 'incomplete',
      statusLabelKey: 'claims-tracking.status.verification', description: 'Need more documents',
      memberTrustSummary: {
        state: 'member_action_required', titleKey: 'claims-tracking.tracking.assurance.title',
        bodyKey: 'claims-tracking.tracking.assurance.body.member_action_required',
        stateLabelKey: 'claims-tracking.tracking.assurance.state.member_action_required',
        supportHref: '/member/help',
      },
    });
    expect(screen.getByTestId('member-claim-trust-sla-panel')).toBeInTheDocument();
    expect(screen.getByTestId('member-claim-sla-status')).toBeInTheDocument();
    expect(screen.getByText('SLA Status')).toBeInTheDocument();
    expect(screen.getByText('Handling assurance')).toBeInTheDocument();
    expectTestIdText([
      ['member-claim-sla-status-phase', 'Waiting for your information before the SLA starts.'],
      ['member-claim-trust-sla-state', 'Waiting for your action'],
      ['member-claim-trust-sla-body', 'We need your information before the response timer can continue.'],
    ]);
    expect(screen.getByRole('link', { name: /Contact support/ })).toHaveAttribute('href', '/member/help');
  });

  it('scrolls to the existing messaging panel when the header send message action is used', async () => {
    await expectMessageScroll(false, 'smooth', {
      id: 'claim-7', title: 'Message Claim', description: 'Claim details', amount: '120',
    });
  });

  it('uses instant message scrolling while reduced motion is preferred', async () => {
    await expectMessageScroll(true, 'auto');
  });
});
