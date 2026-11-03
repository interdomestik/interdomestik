import { render, screen } from '@testing-library/react';
import type { MemberDashboardData } from '@interdomestik/domain-member';
import enMessages from '@/messages/en/dashboard.json';
import mkMessages from '@/messages/mk/dashboard.json';
import sqMessages from '@/messages/sq/dashboard.json';
import srMessages from '@/messages/sr/dashboard.json';
import type { ReactNode } from 'react';
import { expect, vi } from 'vitest';
import { MemberDashboardView } from './member-dashboard-view';

const h = vi.hoisted(() => {
  const mocks = {
    activeSubscription: null as Record<string, unknown> | null,
    documents: 0,
    active: vi.fn(),
    redirect: vi.fn(),
    findSubscriptions: vi.fn((): Promise<Array<Record<string, unknown>>> => Promise.resolve([])),
    // The member document count query: select().from().leftJoin().where() resolves the count row.
    selectDocumentCount: vi.fn(() => ({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([{ count: mocks.documents }])),
        })),
      })),
    })),
    withTenant: vi.fn(
      async (_context: { tenantId: string; role?: string }, action: (tx: unknown) => unknown) =>
        await action({
          query: {
            subscriptions: {
              findMany: mocks.findSubscriptions,
            },
          },
          select: mocks.selectDocumentCount,
        })
    ),
  };
  return mocks;
});

export type DashboardMessages =
  typeof enMessages | typeof mkMessages | typeof sqMessages | typeof srMessages;
export type DashboardClaim = MemberDashboardData['claims'][number];
let currentMessages: DashboardMessages = mkMessages;

export function setDashboardMessages(messages: DashboardMessages): void {
  currentMessages = messages;
}

vi.mock('next/navigation', () => ({
  redirect: h.redirect,
  usePathname: () => '/mk/member',
}));

vi.mock('next-intl/server', () => ({
  // prettier-ignore
  getTranslations: vi.fn((namespace?: string) => Promise.resolve(Object.assign(translate(namespace), { raw: () => JSON.stringify({ manage: { open: 'Resume or manage' } }) }))),
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
    select: h.selectDocumentCount,
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

export const byId = (testId: string) => screen.getByTestId(testId);
export const expectHeroState = (state: string) =>
  expect(byId('member-welcome-status')).toHaveAttribute('data-hero-state', state);
export const expectHref = (testId: string, href: string) =>
  expect(byId(testId)).toHaveAttribute('href', href);

export function makeData(overrides?: Partial<MemberDashboardData>): MemberDashboardData {
  // prettier-ignore
  return {
    activeClaimId: null, claims: [], member: { id: 'member-1', membershipNumber: 'M-100', name: 'Arta Member', role: 'member', tenantId: 'tenant-ks' }, supportHref: '/member/help', ...overrides,
  };
}

export function makeClaim(overrides?: Partial<DashboardClaim>): DashboardClaim {
  // prettier-ignore
  return {
    claimNumber: 'CLM-200', id: 'claim-action', requiresMemberAction: false, stageKey: 'verification', stageLabel: 'Verification', status: 'verification', submittedAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-20T00:00:00.000Z', ...overrides,
  };
}

export function translate(namespace?: string) {
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

export function getPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[part];
  }, source);
}

export function mockActiveMembership() {
  const subscription = {
    currentPeriodEnd: new Date('2026-09-30T00:00:00Z'),
    id: 'sub-active',
    status: 'active',
  };
  h.active.mockResolvedValue(subscription);
  h.findSubscriptions.mockResolvedValue([subscription]);
}

export function expectNoMemberConversionHeroCta() {
  expect(screen.queryByTestId('hero-cta-visitor_general')).not.toBeInTheDocument();
  expect(screen.queryByTestId('hero-cta-visitor_broker_tpl')).not.toBeInTheDocument();
  expect(screen.queryByTestId('hero-cta-visitor_diaspora')).not.toBeInTheDocument();
  expect(screen.queryByTestId('next-step-activate-membership')).not.toBeInTheDocument();
  // prettier-ignore
  expect(byId('member-primary-actions').querySelector('a[href$="/member/membership"]')).not.toBeInTheDocument();
}

export type RenderOptions = {
  draftManagerAvailable?: boolean;
  locale?: string;
  resolved?: boolean;
};
export async function renderDashboard(data = makeData(), options: RenderOptions = {}) {
  const { draftManagerAvailable, locale = 'mk', resolved } = options;
  // prettier-ignore
  render(await MemberDashboardView({ dataPromise: Promise.resolve(data), draftManagerAvailable, locale, supplementalDataPromise: Promise.resolve([await h.active(), h.documents, resolved]) }));
}

export const REQUIRED_MEMBER_ASSISTANCE_KEYS = `
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

export { h };
