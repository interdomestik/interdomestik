import { render, screen, within } from '@testing-library/react';
import type { MemberDashboardData } from '@interdomestik/domain-member';
import enMessages from '@/messages/en/dashboard.json';
import mkMessages from '@/messages/mk/dashboard.json';
import sqMessages from '@/messages/sq/dashboard.json';
import srMessages from '@/messages/sr/dashboard.json';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  activeSubscription: null as Record<string, unknown> | null,
  documentCount: 0,
  getActiveSubscriptionMock: vi.fn(),
  redirectMock: vi.fn(),
  subscriptionFindManyMock: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
  withTenantContextMock: vi.fn(
    async (_context: { tenantId: string; role?: string }, action: (tx: unknown) => unknown) =>
      action({
        query: {
          subscriptions: {
            findMany: hoisted.subscriptionFindManyMock,
          },
        },
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            leftJoin: vi.fn(() => ({
              where: vi.fn(async () => [{ count: hoisted.documentCount }]),
            })),
          })),
        })),
      })
  ),
}));

type DashboardMessages =
  | typeof enMessages
  | typeof mkMessages
  | typeof sqMessages
  | typeof srMessages;

let currentMessages: DashboardMessages = mkMessages;

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
  usePathname: () => '/mk/member',
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (namespace?: string) => translate(namespace)),
}));

vi.mock('@interdomestik/database', () => ({
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  claimDocuments: {
    claimId: 'claim_documents.claim_id',
    tenantId: 'claim_documents.tenant_id',
  },
  claims: {
    id: 'claims.id',
    tenantId: 'claims.tenant_id',
    userId: 'claims.user_id',
  },
  db: {
    query: {
      subscriptions: {
        findMany: hoisted.subscriptionFindManyMock,
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(async () => [{ count: hoisted.documentCount }]),
        })),
      })),
    })),
  },
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  subscriptions: {
    createdAt: 'subscriptions.created_at',
    tenantId: 'subscriptions.tenant_id',
    userId: 'subscriptions.user_id',
  },
  user: {
    id: 'user.id',
  },
  withTenantContext: hoisted.withTenantContextMock,
}));

vi.mock('@interdomestik/domain-membership-billing/subscription', () => ({
  getActiveSubscription: (...args: unknown[]) => hoisted.getActiveSubscriptionMock(...args),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@interdomestik/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}));

import { MemberDashboardView } from './member-dashboard-view';

function makeData(overrides?: Partial<MemberDashboardData>): MemberDashboardData {
  return {
    activeClaimId: null,
    claims: [],
    member: {
      id: 'member-1',
      membershipNumber: 'M-100',
      name: 'Arta Member',
      role: 'member',
      tenantId: 'tenant-ks',
    },
    supportHref: '/member/help',
    ...overrides,
  };
}

function translate(namespace?: string) {
  return (key: string, values?: Record<string, string | number | boolean | Date | null>) => {
    const path = namespace ? `${namespace}.${key}` : key;
    const resolved = getPath(currentMessages, path);
    if (typeof resolved !== 'string') return path;
    let value = resolved;

    if (values) {
      for (const [token, replacement] of Object.entries(values)) {
        value = value.replace(`{${token}}`, String(replacement ?? ''));
      }
    }

    return value;
  };
}

function getPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[part];
  }, source);
}

function mockActiveMembership() {
  const subscription = {
    currentPeriodEnd: new Date('2026-09-30T00:00:00Z'),
    id: 'sub-active',
    status: 'active',
  };
  hoisted.getActiveSubscriptionMock.mockResolvedValue(subscription);
  hoisted.subscriptionFindManyMock.mockResolvedValue([subscription]);
}

function expectNoMemberConversionHeroCta() {
  expect(screen.queryByTestId('hero-cta-visitor_general')).not.toBeInTheDocument();
  expect(screen.queryByTestId('hero-cta-visitor_broker_tpl')).not.toBeInTheDocument();
  expect(screen.queryByTestId('hero-cta-visitor_diaspora')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', {
      name: /activate assistance|активирај асистенција|aktiviraj asistenciju|aktivizo asistencën/i,
    })
  ).not.toBeInTheDocument();
}

describe('MemberDashboardView assistance dashboard', () => {
  beforeEach(() => {
    currentMessages = mkMessages;
    hoisted.documentCount = 0;
    hoisted.getActiveSubscriptionMock.mockReset();
    hoisted.getActiveSubscriptionMock.mockResolvedValue(null);
    hoisted.redirectMock.mockReset();
    hoisted.subscriptionFindManyMock.mockReset();
    hoisted.subscriptionFindManyMock.mockResolvedValue([]);
    hoisted.withTenantContextMock.mockClear();
  });

  it('renders active member status with a mobile-first assistance command center', async () => {
    mockActiveMembership();
    hoisted.documentCount = 4;

    const tree = await MemberDashboardView({ data: makeData(), locale: 'mk' });
    render(tree);

    expect(screen.getByTestId('member-app-header')).toHaveTextContent('Интердоместик ИДА');
    expect(screen.getByTestId('member-app-header')).toHaveTextContent('Полесно е заедно');
    expect(screen.getByTestId('member-welcome-status')).toHaveTextContent('Активно');
    expect(screen.getByTestId('member-welcome-status')).toHaveAttribute(
      'data-hero-state',
      'member_active_no_case'
    );
    expect(screen.getByTestId('hero-cta-open-first-case')).toHaveAttribute(
      'href',
      '/mk/member/claims/new'
    );
    expect(screen.getByTestId('member-hero-value-row')).toHaveTextContent('Активна асистенција');
    expect(screen.queryByTestId('hero-cta-visitor_general')).not.toBeInTheDocument();
    expect(screen.getByTestId('member-primary-action-panel')).toBeInTheDocument();
    expect(screen.getAllByTestId('main-service-card')).toHaveLength(5);
    expect(screen.getByText('Сакам Interdomestik да го следи случајот')).toBeInTheDocument();
    expect(screen.getByTestId('document-vault-summary')).toHaveTextContent('4');
    expect(screen.getByTestId('trust-strip')).toHaveTextContent('Центар за доверба');
    expect(screen.getByTestId('mobile-bottom-nav')).toHaveTextContent('Почетна');
  });

  it('treats agent member-mode access as assistance/action, not visitor conversion', async () => {
    const tree = await MemberDashboardView({
      data: makeData({
        member: {
          id: 'agent-1',
          membershipNumber: null,
          name: 'Blerim Agent',
          role: 'agent',
          tenantId: 'tenant-ks',
        },
      }),
      locale: 'mk',
    });
    render(tree);

    expect(screen.getByTestId('member-welcome-status')).toHaveAttribute(
      'data-hero-state',
      'member_active_no_case'
    );
    expect(screen.getByTestId('hero-cta-open-first-case')).toHaveAttribute(
      'href',
      '/mk/member/claims/new'
    );
    expect(screen.queryByTestId('hero-cta-visitor_general')).not.toBeInTheDocument();
  });

  it('renders inactive visitor state with free-versus-member assistance boundary', async () => {
    const tree = await MemberDashboardView({ data: makeData(), locale: 'mk' });
    render(tree);

    expect(screen.getByTestId('member-welcome-status')).toHaveTextContent('Посетител / неактивно');
    expect(screen.getByTestId('member-welcome-status')).toHaveAttribute(
      'data-hero-state',
      'visitor_general'
    );
    expect(screen.getByTestId('hero-cta-visitor_general')).toHaveAttribute(
      'href',
      '/mk/member/membership'
    );
    expect(screen.getByTestId('member-hero-value-row')).toHaveTextContent('20 EUR/год.');
    expect(screen.getByTestId('member-inactive-boundary')).toHaveTextContent(
      'Што е бесплатно и што бара членство'
    );
    expect(screen.getByTestId('next-step-activate-membership')).toHaveAttribute(
      'href',
      '/mk/member/membership'
    );
  });

  it('renders the no-active-case empty state calmly', async () => {
    mockActiveMembership();

    const tree = await MemberDashboardView({ data: makeData(), locale: 'mk' });
    render(tree);

    expect(screen.getByTestId('next-step-open-first-case')).toBeInTheDocument();
    expect(screen.getByTestId('empty-state-case-panel')).toHaveTextContent(
      'Сè уште немате отворено случај'
    );
  });

  it('renders active case status, number, last update, and member next action', async () => {
    mockActiveMembership();

    const tree = await MemberDashboardView({
      data: makeData({
        activeClaimId: 'claim-action',
        claims: [
          {
            claimNumber: 'CLM-200',
            id: 'claim-action',
            nextMemberAction: {
              actionType: 'upload_document',
              href: '/member/claims/claim-action/documents',
              label: 'Upload evidence',
            },
            requiresMemberAction: true,
            stageKey: 'verification',
            stageLabel: 'Verification',
            status: 'verification',
            submittedAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-20T00:00:00.000Z',
          },
        ],
      }),
      locale: 'mk',
    });
    render(tree);

    expect(screen.getByTestId('next-step-missingDocs')).toHaveAttribute(
      'href',
      '/member/claims/claim-action/documents'
    );
    expect(screen.getByTestId('member-welcome-status')).toHaveAttribute(
      'data-hero-state',
      'missing_documents'
    );
    expect(screen.getByTestId('hero-cta-upload-documents')).toHaveAttribute(
      'href',
      '/member/claims/claim-action/documents'
    );
    expect(screen.getByRole('link', { name: 'Отвори документи' })).toHaveAttribute(
      'href',
      '/member/claims/claim-action/documents'
    );
    expectNoMemberConversionHeroCta();
    const activeCase = screen.getByTestId('active-case-card');
    expect(within(activeCase).getByText(/CLM-200/)).toBeInTheDocument();
    expect(within(activeCase).getByText(/Verification/)).toBeInTheDocument();
    expect(within(activeCase).getByText('Upload evidence')).toBeInTheDocument();
  });

  it('renders authorization-needed hero, interactive CTA, and no member conversion CTA', async () => {
    currentMessages = enMessages;
    mockActiveMembership();

    const tree = await MemberDashboardView({
      data: makeData({
        activeClaimId: 'claim-auth',
        claims: [
          {
            claimNumber: 'CLM-300',
            id: 'claim-auth',
            nextMemberAction: {
              actionType: 'provide_info',
              href: '/member/claims/claim-auth/documents/authorization.pdf',
              label: 'Review authorization file',
            },
            requiresMemberAction: true,
            stageKey: 'authorization_needed',
            stageLabel: 'Authorization needed',
            status: 'verification',
            submittedAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-22T00:00:00.000Z',
          },
        ],
      }),
      locale: 'en',
    });
    render(tree);

    expect(screen.getByTestId('member-welcome-status')).toHaveAttribute(
      'data-hero-state',
      'authorization_needed'
    );
    expect(screen.getByTestId('member-hero-value-row')).toHaveTextContent('Signature needed');
    expect(screen.getByTestId('hero-cta-sign-authorization')).toHaveAttribute(
      'href',
      '/en/member/claims/claim-auth'
    );
    expect(screen.getByTestId('hero-cta-sign-authorization')).toHaveAccessibleName(
      'Review authorization'
    );
    expect(screen.getByTestId('next-step-authorization')).toHaveAttribute(
      'href',
      '/en/member/claims/claim-auth'
    );
    expectNoMemberConversionHeroCta();
  });

  it('shows only one priority case on the dashboard home', async () => {
    mockActiveMembership();

    const tree = await MemberDashboardView({
      data: makeData({
        activeClaimId: 'claim-action',
        claims: [
          {
            claimNumber: 'CLM-200',
            id: 'claim-action',
            requiresMemberAction: false,
            stageKey: 'verification',
            stageLabel: 'Verification',
            status: 'verification',
            submittedAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-20T00:00:00.000Z',
          },
          {
            claimNumber: 'CLM-201',
            id: 'claim-secondary',
            requiresMemberAction: false,
            stageKey: 'evaluation',
            stageLabel: 'Evaluation',
            status: 'evaluation',
            submittedAt: '2026-04-02T00:00:00.000Z',
            updatedAt: '2026-04-21T00:00:00.000Z',
          },
        ],
      }),
      locale: 'mk',
    });
    render(tree);

    expect(screen.getAllByTestId('active-case-card')).toHaveLength(1);
    expect(screen.getByTestId('member-welcome-status')).toHaveAttribute(
      'data-hero-state',
      'member_active_has_open_case'
    );
    expect(screen.getByTestId('hero-cta-open-active-case')).toHaveAttribute(
      'href',
      '/mk/member/claims/claim-action'
    );
    expect(screen.getByText(/CLM-200/)).toBeInTheDocument();
    expect(screen.queryByText(/CLM-201/)).not.toBeInTheDocument();
  });

  it.each([
    ['sq', sqMessages],
    ['mk', mkMessages],
    ['en', enMessages],
    ['sr', srMessages],
  ])('has complete member assistance i18n keys for %s', (_locale, messages) => {
    for (const path of REQUIRED_MEMBER_ASSISTANCE_KEYS) {
      expect(getPath(messages, path), path).toEqual(expect.any(String));
    }
  });

  it('does not introduce forbidden compensation or insurer claims in member assistance copy', () => {
    const forbiddenPatterns = [
      /we guarantee compensation/i,
      /we pay damages/i,
      /you will win/i,
      /we replace insurance/i,
      /we are your insurer/i,
      /garantojmë kompensim/i,
      /paguajmë dëmet/i,
      /do të fitoni/i,
      /zëvendësojmë sigurimin/i,
      /ne jemi siguruesi juaj/i,
      /гарантираме компензација/i,
      /плаќаме штета/i,
      /ќе победите/i,
      /го заменуваме осигурувањето/i,
      /ние сме ваш осигурител/i,
    ];

    for (const messages of [sqMessages, mkMessages, enMessages, srMessages]) {
      const copy = JSON.stringify(messages.dashboard.member_assistance);
      for (const pattern of forbiddenPatterns) {
        expect(copy).not.toMatch(pattern);
      }
    }
  });
});

const REQUIRED_MEMBER_ASSISTANCE_KEYS = [
  'dashboard.member_assistance.header.product',
  'dashboard.member_assistance.header.notifications',
  'dashboard.member_assistance.header.profile',
  'dashboard.member_assistance.welcome.active',
  'dashboard.member_assistance.welcome.inactive',
  'dashboard.member_assistance.heroResolver.nextActionLabel',
  'dashboard.member_assistance.heroResolver.states.visitor_general.title',
  'dashboard.member_assistance.heroResolver.states.visitor_general.cta',
  'dashboard.member_assistance.heroResolver.states.visitor_broker_tpl.title',
  'dashboard.member_assistance.heroResolver.states.visitor_broker_tpl.cta',
  'dashboard.member_assistance.heroResolver.states.visitor_diaspora.title',
  'dashboard.member_assistance.heroResolver.states.visitor_diaspora.cta',
  'dashboard.member_assistance.heroResolver.states.member_active_no_case.title',
  'dashboard.member_assistance.heroResolver.states.member_active_no_case.cta',
  'dashboard.member_assistance.heroResolver.states.member_active_has_open_case.title',
  'dashboard.member_assistance.heroResolver.states.member_active_has_open_case.cta',
  'dashboard.member_assistance.heroResolver.states.missing_documents.title',
  'dashboard.member_assistance.heroResolver.states.missing_documents.cta',
  'dashboard.member_assistance.heroResolver.states.authorization_needed.title',
  'dashboard.member_assistance.heroResolver.states.authorization_needed.cta',
  'dashboard.member_assistance.nextStep.firstCase.title',
  'dashboard.member_assistance.nextStep.missingDocs.title',
  'dashboard.member_assistance.nextStep.review.title',
  'dashboard.member_assistance.nextStep.authorization.title',
  'dashboard.member_assistance.inactive.cta',
  'dashboard.member_assistance.services.cards.helpNow.situation',
  'dashboard.member_assistance.services.cards.helpNow.body',
  'dashboard.member_assistance.services.cards.reportClaim.situation',
  'dashboard.member_assistance.services.cards.reportClaim.body',
  'dashboard.member_assistance.services.cards.complaint.situation',
  'dashboard.member_assistance.services.cards.complaint.body',
  'dashboard.member_assistance.services.cards.procedureGuide.situation',
  'dashboard.member_assistance.services.cards.procedureGuide.body',
  'dashboard.member_assistance.services.cards.recovery.situation',
  'dashboard.member_assistance.services.cards.recovery.body',
  'dashboard.member_assistance.services.cards.flightDelay.situation',
  'dashboard.member_assistance.services.cards.flightDelay.body',
  'dashboard.member_assistance.cases.emptyBody',
  'dashboard.member_assistance.documents.consent',
  'dashboard.member_assistance.trust.center',
  'dashboard.member_assistance.bottomNav.label',
  'dashboard.member_assistance.bottomNav.home',
  'dashboard.member_assistance.bottomNav.cases',
  'dashboard.member_assistance.bottomNav.help',
  'dashboard.member_assistance.bottomNav.documents',
  'dashboard.member_assistance.bottomNav.more',
];
