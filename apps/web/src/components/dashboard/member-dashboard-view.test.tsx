import { render, screen, within } from '@testing-library/react';
import type { MemberDashboardData } from '@interdomestik/domain-member';
import enMessages from '@/messages/en/dashboard.json';
import mkMessages from '@/messages/mk/dashboard.json';
import sqMessages from '@/messages/sq/dashboard.json';
import srMessages from '@/messages/sr/dashboard.json';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  activeSubscription: null as Record<string, unknown> | null,
  documents: 0,
  active: vi.fn(),
  redirect: vi.fn(),
  findSubscriptions: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
  withTenant: vi.fn(
    async (_context: { tenantId: string; role?: string }, action: (tx: unknown) => unknown) =>
      action({
        query: {
          subscriptions: {
            findMany: h.findSubscriptions,
          },
        },
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            leftJoin: vi.fn(() => ({
              where: vi.fn(async () => [{ count: h.documents }]),
            })),
          })),
        })),
      })
  ),
}));

type DashboardMessages =
  typeof enMessages | typeof mkMessages | typeof sqMessages | typeof srMessages;
type DashboardClaim = MemberDashboardData['claims'][number];
let currentMessages: DashboardMessages = mkMessages;

vi.mock('next/navigation', () => ({
  redirect: h.redirect,
  usePathname: () => '/mk/member',
}));

vi.mock('next-intl/server', () => ({
  // prettier-ignore
  getTranslations: vi.fn(async (namespace?: string) => Object.assign(translate(namespace), { raw: () => JSON.stringify({ manage: { open: 'Resume or manage' } }) })),
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
        findMany: h.findSubscriptions,
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(async () => [{ count: h.documents }]),
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
  withTenantContext: h.withTenant,
}));

vi.mock('@interdomestik/domain-membership-billing/subscription', () => ({
  getActiveSubscription: (...args: unknown[]) => h.active(...args),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@interdomestik/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}));

import { getDashboardSupplementalData, MemberDashboardView } from './member-dashboard-view';

const byId = (testId: string) => screen.getByTestId(testId);
const expectHeroState = (state: string) =>
  expect(byId('member-welcome-status')).toHaveAttribute('data-hero-state', state);
const expectHref = (testId: string, href: string) =>
  expect(byId(testId)).toHaveAttribute('href', href);

function makeData(overrides?: Partial<MemberDashboardData>): MemberDashboardData {
  // prettier-ignore
  return {
    activeClaimId: null, claims: [], member: { id: 'member-1', membershipNumber: 'M-100', name: 'Arta Member', role: 'member', tenantId: 'tenant-ks' }, supportHref: '/member/help', ...overrides,
  };
}

function makeClaim(overrides?: Partial<DashboardClaim>): DashboardClaim {
  // prettier-ignore
  return {
    claimNumber: 'CLM-200', id: 'claim-action', requiresMemberAction: false, stageKey: 'verification', stageLabel: 'Verification', status: 'verification', submittedAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-20T00:00:00.000Z', ...overrides,
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
  h.active.mockResolvedValue(subscription);
  h.findSubscriptions.mockResolvedValue([subscription]);
}

function expectNoMemberConversionHeroCta() {
  expect(screen.queryByTestId('hero-cta-visitor_general')).not.toBeInTheDocument();
  expect(screen.queryByTestId('hero-cta-visitor_broker_tpl')).not.toBeInTheDocument();
  expect(screen.queryByTestId('hero-cta-visitor_diaspora')).not.toBeInTheDocument();
  expect(screen.queryByTestId('next-step-activate-membership')).not.toBeInTheDocument();
  // prettier-ignore
  expect(byId('member-primary-actions').querySelector('a[href$="/member/membership"]')).not.toBeInTheDocument();
}

type RenderOptions = { draftManagerAvailable?: boolean; locale?: string; resolved?: boolean };
async function renderDashboard(data = makeData(), options: RenderOptions = {}) {
  const { draftManagerAvailable, locale = 'mk', resolved } = options;
  // prettier-ignore
  render(await MemberDashboardView({ dataPromise: Promise.resolve(data), draftManagerAvailable, locale, supplementalDataPromise: Promise.resolve([await h.active(), h.documents, resolved]) }));
}

describe('MemberDashboardView assistance dashboard', () => {
  beforeEach(() => {
    currentMessages = mkMessages;
    h.documents = 0;
    h.active.mockReset();
    h.active.mockResolvedValue(null);
    h.redirect.mockReset();
    h.findSubscriptions.mockReset();
    h.findSubscriptions.mockResolvedValue([]);
    h.withTenant.mockClear();
  });

  it('renders active member status with a mobile-first assistance command center', async () => {
    mockActiveMembership();
    h.documents = 4;

    await renderDashboard(makeData(), { draftManagerAvailable: true, resolved: true });

    const appHeader = within(byId('member-app-header'));
    expect(byId('member-app-header')).toHaveTextContent('Интердоместик ИДА');
    expect(byId('member-app-header')).toHaveTextContent('Полесно е заедно');
    expect(appHeader.getByRole('link', { name: 'Известувања' })).toHaveAttribute(
      'href',
      '/mk/member/settings#notifications'
    );
    expect(appHeader.getByRole('link', { name: 'Членски профил' })).toHaveAttribute(
      'href',
      '/mk/member/settings#profile'
    );
    expect(byId('member-welcome-status')).toHaveTextContent('Активно');
    expectHeroState('member_active_no_case');
    expectHref('hero-cta-open-first-case', '/mk/member/claims/new');
    expectHref('member-draft-continuation', '/mk/member/claims/new');
    expect(byId('member-hero-value-row')).toHaveTextContent('Активна асистенција');
    expect(screen.queryByTestId('hero-cta-visitor_general')).not.toBeInTheDocument();
    expect(byId('member-primary-action-panel')).toBeInTheDocument();
    expect(screen.getAllByTestId('main-service-card')).toHaveLength(5);
    expect(screen.getByText('Сакам Interdomestik да го следи случајот')).toBeInTheDocument();
    expect(byId('document-vault-summary')).toHaveTextContent('4');
    expect(byId('trust-strip')).toHaveTextContent('Центар за доверба');
    expect(byId('mobile-bottom-nav')).toHaveTextContent('Почетна');

    const nextStepHeadingIds = screen
      .getAllByTestId('next-step-card')
      .map(card => card.getAttribute('aria-labelledby'));
    expect(new Set(nextStepHeadingIds).size).toBe(nextStepHeadingIds.length);
    for (const headingId of nextStepHeadingIds) {
      expect(headingId).toBeTruthy();
      expect(document.querySelectorAll(`[id="${headingId}"]`)).toHaveLength(1);
    }
  });

  it('treats agent member-mode access as assistance/action, not visitor conversion', async () => {
    // prettier-ignore
    await renderDashboard(makeData({ member: { id: 'agent-1', membershipNumber: null, name: 'Blerim Agent', role: 'agent', tenantId: 'tenant-ks' } }), { draftManagerAvailable: true, resolved: false });

    expectHeroState('member_active_no_case');
    expectHref('hero-cta-open-first-case', '/mk/member/claims/new');
    expect(screen.queryByTestId('hero-cta-visitor_general')).not.toBeInTheDocument();
    expect(screen.queryByTestId('member-draft-continuation')).not.toBeInTheDocument();
  });

  it('renders inactive visitor state with free-versus-member assistance boundary', async () => {
    await renderDashboard(makeData(), { draftManagerAvailable: true, resolved: true });

    expect(byId('member-welcome-status')).toHaveTextContent('Посетител / неактивно');
    expectHeroState('visitor_general');
    expectHref('hero-cta-visitor_general', '/mk/member/membership');
    expect(byId('member-hero-value-row')).toHaveTextContent('20 EUR/год.');
    expect(byId('member-inactive-boundary')).toHaveTextContent(
      'Што е бесплатно и што бара членство'
    );
    expectHref('next-step-activate-membership', '/mk/member/membership');
    // prettier-ignore
    expect(byId('member-draft-continuation')).toHaveAttribute('href', '/mk/member/claims/new?mode=drafts');
  });

  it('defaults optional dashboard draft eligibility to false', async () => {
    await renderDashboard(makeData(), { resolved: true });
    expect(screen.queryByTestId('member-draft-continuation')).not.toBeInTheDocument();
  });

  it('renders the no-active-case empty state calmly', async () => {
    mockActiveMembership();

    await renderDashboard();

    expect(byId('next-step-open-first-case')).toBeInTheDocument();
    expect(byId('empty-state-case-panel')).toHaveTextContent('Сè уште немате отворено случај');
  });

  it('renders active case status, number, last update, and member next action', async () => {
    mockActiveMembership();

    await renderDashboard(
      makeData({
        activeClaimId: 'claim-action',
        claims: [
          makeClaim({
            nextMemberAction: {
              actionType: 'upload_document',
              href: '/member/claims/claim-action/documents',
              label: 'Upload evidence',
            },
            requiresMemberAction: true,
          }),
        ],
      })
    );

    expectHref('next-step-missingDocs', '/member/claims/claim-action/documents');
    expectHeroState('missing_documents');
    expectHref('hero-cta-upload-documents', '/member/claims/claim-action/documents');
    expect(screen.getByRole('link', { name: 'Отвори документи' })).toHaveAttribute(
      'href',
      '/member/claims/claim-action/documents'
    );
    expectNoMemberConversionHeroCta();
    const activeCase = byId('active-case-card');
    expect(within(activeCase).getByText(/CLM-200/)).toBeInTheDocument();
    expect(within(activeCase).getByText(/Verification/)).toBeInTheDocument();
    expect(within(activeCase).getByText('Upload evidence')).toBeInTheDocument();
  });

  it('renders authorization-needed hero, interactive CTA, and no member conversion CTA', async () => {
    currentMessages = enMessages;
    mockActiveMembership();

    await renderDashboard(
      makeData({
        activeClaimId: 'claim-auth',
        claims: [
          makeClaim({
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
            updatedAt: '2026-04-22T00:00:00.000Z',
          }),
        ],
      }),
      { locale: 'en' }
    );

    expectHeroState('authorization_needed');
    expect(byId('member-hero-value-row')).toHaveTextContent('Signature needed');
    expectHref('hero-cta-sign-authorization', '/en/member/claims/claim-auth');
    expect(byId('hero-cta-sign-authorization')).toHaveAccessibleName('Review authorization');
    expectHref('next-step-authorization', '/en/member/claims/claim-auth');
    expectNoMemberConversionHeroCta();
  });

  it.each([
    [
      'review_offer',
      '/member/claims/claim-offer/offer',
      'Provider offer label',
      'Review offer',
      'Review offer for case CLM-410',
    ],
    [
      'provide_info',
      '/member/claims/claim-info/request',
      'Provider information label',
      'Provide information',
      'Provide information for case CLM-411',
    ],
  ] as const)(
    'renders %s as a first-class member-action hero with typed localized CTA',
    async (actionType, href, rawLabel, visibleCta, accessibleName) => {
      currentMessages = enMessages;
      mockActiveMembership();
      const claimId = actionType === 'review_offer' ? 'claim-offer' : 'claim-info';
      const claimNumber = actionType === 'review_offer' ? 'CLM-410' : 'CLM-411';

      await renderDashboard(
        makeData({
          activeClaimId: claimId,
          claims: [
            makeClaim({
              claimNumber,
              id: claimId,
              nextMemberAction: { actionType, href, label: rawLabel },
              requiresMemberAction: true,
              stageKey: 'verification',
              stageLabel: 'Verification',
            }),
          ],
        }),
        { locale: 'en' }
      );

      const heroCta = byId('hero-cta-member-action');

      expectHeroState('member_action');
      expect(byId('member-hero-value-row')).toHaveTextContent(visibleCta);
      expect(heroCta).toHaveAttribute('href', href);
      expect(heroCta).toHaveTextContent(visibleCta);
      expect(heroCta).toHaveAccessibleName(accessibleName);
      expectHref('next-step-memberAction', href);
      expect(byId('next-step-memberAction')).toHaveTextContent(rawLabel);
      expectNoMemberConversionHeroCta();
    }
  );

  it('shows only one priority case on the dashboard home', async () => {
    mockActiveMembership();
    await renderDashboard(
      makeData({
        activeClaimId: 'claim-action',
        claims: [
          makeClaim(),
          makeClaim({
            claimNumber: 'CLM-201',
            id: 'claim-secondary',
            stageKey: 'evaluation',
            stageLabel: 'Evaluation',
            status: 'evaluation',
            submittedAt: '2026-04-02T00:00:00.000Z',
            updatedAt: '2026-04-21T00:00:00.000Z',
          }),
        ],
      })
    );
    expect(screen.getAllByTestId('active-case-card')).toHaveLength(1);
    expectHeroState('member_active_has_open_case');
    expectHref('hero-cta-open-active-case', '/mk/member/claims/claim-action');
    expect(screen.getByText(/CLM-200/)).toBeInTheDocument();
    expect(screen.queryByText(/CLM-201/)).not.toBeInTheDocument();
  });

  it('fails draft continuation closed when subscription resolution is unavailable', async () => {
    await expect(
      getDashboardSupplementalData({ memberId: 'member-missing', tenantId: null })
    ).resolves.toEqual([null, 0, false]);
    h.active.mockResolvedValueOnce(null);
    await expect(
      getDashboardSupplementalData({ memberId: 'member-fulfilled', tenantId: 'tenant-ks' })
    ).resolves.toEqual([null, 0, true]);
    h.active.mockRejectedValueOnce(new Error('subscription unavailable'));
    await expect(
      getDashboardSupplementalData({ memberId: 'member-rejected', tenantId: 'tenant-ks' })
    ).resolves.toEqual([null, 0, false]);
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
    // prettier-ignore
    const forbiddenPatterns = [
      /we guarantee compensation/i, /we pay damages/i, /you will win/i, /we replace insurance/i, /we are your insurer/i,
      /garantojmë kompensim/i, /paguajmë dëmet/i, /do të fitoni/i, /zëvendësojmë sigurimin/i, /ne jemi siguruesi juaj/i,
      /гарантираме компензација/i, /плаќаме штета/i, /ќе победите/i, /го заменуваме осигурувањето/i, /ние сме ваш осигурител/i,
    ];

    for (const messages of [sqMessages, mkMessages, enMessages, srMessages]) {
      const copy = JSON.stringify(messages.dashboard.member_assistance);
      for (const pattern of forbiddenPatterns) {
        expect(copy).not.toMatch(pattern);
      }
    }
  });
});

const REQUIRED_MEMBER_ASSISTANCE_KEYS = `
header.product header.notifications header.profile welcome.active welcome.inactive
heroResolver.nextActionLabel heroResolver.states.visitor_general.title
heroResolver.states.visitor_general.cta heroResolver.states.visitor_broker_tpl.title
heroResolver.states.visitor_broker_tpl.cta heroResolver.states.visitor_diaspora.title
heroResolver.states.visitor_diaspora.cta heroResolver.states.member_active_no_case.title
heroResolver.states.member_active_no_case.cta heroResolver.states.member_active_has_open_case.title
heroResolver.states.member_active_has_open_case.cta heroResolver.states.missing_documents.title
heroResolver.states.missing_documents.cta heroResolver.states.authorization_needed.title
heroResolver.states.authorization_needed.cta heroResolver.states.member_action.kicker
heroResolver.states.member_action.title heroResolver.states.member_action.highlight
heroResolver.states.member_action.body heroResolver.states.member_action.valueLabel
heroResolver.states.member_action.value heroResolver.states.member_action.cta
heroResolver.states.member_action.actions.review_offer.cta
heroResolver.states.member_action.actions.review_offer.ariaLabel
heroResolver.states.member_action.actions.provide_info.cta
heroResolver.states.member_action.actions.provide_info.ariaLabel nextStep.firstCase.title
nextStep.missingDocs.title nextStep.review.title nextStep.authorization.title inactive.cta
services.cards.helpNow.situation services.cards.helpNow.body services.cards.reportClaim.situation
services.cards.reportClaim.body services.cards.complaint.situation services.cards.complaint.body
services.cards.procedureGuide.situation services.cards.procedureGuide.body
services.cards.recovery.situation services.cards.recovery.body services.cards.flightDelay.situation
services.cards.flightDelay.body cases.emptyBody documents.consent trust.center bottomNav.label
bottomNav.home bottomNav.cases bottomNav.help bottomNav.documents bottomNav.more
`
  .trim()
  .split(/\s+/u)
  .map(key => `dashboard.member_assistance.${key}`);
