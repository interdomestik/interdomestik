import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { MemberDashboardData } from '@interdomestik/domain-member';

const hoisted = vi.hoisted(() => ({
  andMock: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  userFindFirstMock: vi.fn(async () => ({
    id: 'member-1',
    name: 'Stefan Dimitrioski',
    role: 'member',
    memberNumber: 'ID-MEMBER',
    tenantId: 'tenant-ks',
  })),
  subscriptionFindManyMock: vi.fn(async (): Promise<Array<Record<string, unknown>>> => []),
  getActiveSubscriptionMock: vi.fn(async (): Promise<Record<string, unknown> | null> => null),
  redirectMock: vi.fn(),
}));

const guidanceTranslationMap = Object.fromEntries(
  `guidance_label|Денес
guidance_title|Вашиот најважен следен чекор
guidance_subtitle_active|Панелот ги држи барањата, документите и поддршката на едно место.
guidance_subtitle_inactive|Активирајте членство за да отклучите приоритетна поддршка.
guidance_membership_active|Членството е активно
guidance_membership_inactive|Потребна е активација
guidance_no_claim_title|Започнете кога ќе се случи инцидент
guidance_no_claim_body|Отворете го приемот на барање и внесете ги основните факти.
guidance_start_claim_cta|Започни барање
guidance_action_needed_title|Потребно е дејство
guidance_action_needed_body|Барањето {claimNumber} чека ваш внес за тимот да продолжи со тријажа.
guidance_active_claim_title|Барањето е во процес
guidance_active_claim_body|Барањето {claimNumber} е во активниот тек.
guidance_claim_review_cta|Отвори барање
guidance_claims_title|Прегледај историја
guidance_claims_body|Затворените барања остануваат достапни.
guidance_claims_cta|Види барања
guidance_documents_title|Организирај документи
guidance_documents_body|Чувајте фотографии, извештаи, фактури и полиси со барањето.
guidance_documents_cta|Отвори документи
guidance_support_title|Подготвеност за поддршка
guidance_membership_valid_thru|Приоритетната поддршка е достапна. Важи до: {validThru}.
guidance_support_inactive_body|Членската поддршка е ограничена додека не заврши активацијата.
guidance_support_cta|Контактирај поддршка
guidance_membership_cta|Активирај членство`
    .split('\n')
    .map(row => {
      const separator = row.indexOf('|');
      return [`dashboard.member_landing.${row.slice(0, separator)}`, row.slice(separator + 1)];
    })
);

const translationMap: Record<string, string> = {
  'dashboard.member_landing.page_title': 'Панел за членови',
  'dashboard.member_landing.more_services': 'Повеќе услуги',
  'dashboard.member_landing.hero_greeting': 'Добредојде',
  'dashboard.member_landing.hero_subtitle_active':
    'Вашето членство е активно. Подготвени сме да помогнеме.',
  'dashboard.member_landing.hero_subtitle_inactive': 'Вашето членство сè уште не е активно.',
  'dashboard.member_landing.activation_title': 'Активирај го членството',
  'dashboard.member_landing.activation_body':
    'Завршете го вашиот план за да пристапите до приоритетна поддршка и нови барања.',
  'dashboard.member_landing.activation_primary_cta': 'Отвори членство',
  'dashboard.member_landing.activation_secondary_cta': 'Види планови',
  'dashboard.member_landing.status_label': 'Статус',
  'dashboard.member_landing.status_active': 'Активно',
  'dashboard.member_landing.status_pending': 'Во чекање',
  'dashboard.member_landing.response_label': 'Просечно време',
  'dashboard.member_landing.response_value': '< 3 Мин',
  'dashboard.member_landing.card_ready_label': 'Дигитална картичка',
  'dashboard.member_landing.card_ready_value': 'Спремна',
  'dashboard.member_landing.protection_label': 'Заштита',
  'dashboard.member_landing.level_label': 'Ниво',
  'dashboard.member_landing.level_value': 'Премиум елит',
  ...guidanceTranslationMap,
  'dashboard.member_landing.diaspora_description':
    'Специјализирана архитектура за заштита за членови низ Европа и пошироко.',
  'dashboard.member_landing.live_protection_title': 'Заштита во живо',
  'dashboard.member_landing.system_integrity': 'Интегритет на системот',
  'dashboard.member_landing.integrity_low': 'Ниско',
  'dashboard.member_landing.nodes': 'Јазли',
  'dashboard.member_landing.latency': 'Доцнење',
  'dashboard.member_landing.active_protection_nodes': 'Активни заштитни јазли',
  'dashboard.member_landing.online': 'Онлајн',
  'dashboard.member_landing.get_help_support': 'Побарај помош и поддршка',
  'dashboard.member_landing.system_ecosystem': 'Системски екосистем',
  'dashboard.member_landing.explore_all': 'Истражи ги сите',
  'dashboard.member_landing.property_damage_desc': 'Проценка на штета',
  'dashboard.member_landing.health_safety_desc': 'Медицински насоки',
  'dashboard.member_landing.my_documents_desc': 'Сеф за полиси',
  'dashboard.member_landing.contact_center_desc': 'Човечка поддршка',
  'dashboard.member_landing.command_center_title': '24/7 КОМАНДЕН ЦЕНТАР',
  'dashboard.member_landing.priority_line_active': 'ПРИОРИТЕТНА ЛИНИЈА АКТИВНА',
  'dashboard.member_landing.country_north_macedonia': 'Северна Македонија',
  'dashboard.member_landing.country_kosovo': 'Република Косово',
  'dashboard.member_landing.available_now_avg_response':
    'Достапно сега • Просечен одговор {seconds}',
  'dashboard.member_landing.status_insight_title': 'Статусен увид',
  'dashboard.member_landing.status_insight_body':
    'Вашиот статус на заштита се следи во реално време од нашиот глобален оперативен центар.',
  'dashboard.member_landing.support_panel_title': 'Подготвеност за поддршка',
  'dashboard.member_landing.support_readiness_label': 'Подготвеност',
  'dashboard.member_landing.support_readiness_active': 'Подготвено сега',
  'dashboard.member_landing.support_readiness_pending': 'Во чекање',
  'dashboard.member_landing.support_channel_label': 'Главен канал',
  'dashboard.member_landing.support_channel_value': 'Телефон + WhatsApp',
  'dashboard.member_landing.support_window_label': 'Покриеност',
  'dashboard.member_landing.support_window_value': '24/7',
  'dashboard.member_landing.support_highlights_title': 'Што вклучува поддршката',
  'dashboard.member_landing.support_highlight_one': 'Тријажа на инцидент',
  'dashboard.member_landing.support_highlight_two': 'Насоки за документи',
  'dashboard.member_landing.support_highlight_three': 'Координација за патување',
  'dashboard.member_landing.online_now': 'Онлајн сега',
  'dashboard.member_landing.support_panel_cta': 'Отвори членска поддршка',
  'dashboard.member_landing.support_phone_label': 'Телефон за поддршка',
  'dashboard.member_landing.support_whatsapp_label': 'WhatsApp линија',
  'dashboard.member_landing.support_whatsapp_value': 'Разговорот е достапен сега',
  'dashboard.member_landing.command_center_body':
    'Контактирајте го тимот за членска поддршка за итни инциденти и насоки за документи.',
  'dashboard.member_landing.review_security_parameters': 'Провери безбедносни параметри',
  'dashboard.protection_status.inactive': 'Нема активна заштита',
  'dashboard.categories.property_damage': 'Штета на имот',
  'dashboard.categories.health_safety': 'Здравје и безбедност',
  'dashboard.categories.my_documents': 'Мои документи',
  'dashboard.categories.contact_center': 'Контакт центар',
};

function translate(namespace?: string) {
  return (key: string, values?: Record<string, string>) => {
    const fullKey = namespace ? `${namespace}.${key}` : key;
    let value = translationMap[fullKey] ?? fullKey;
    if (values) {
      for (const [token, replacement] of Object.entries(values)) {
        value = value.replace(`{${token}}`, replacement);
      }
    }
    return value;
  };
}

vi.mock('next/navigation', () => ({
  redirect: hoisted.redirectMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async (namespace?: string) => translate(namespace)),
}));

vi.mock('@interdomestik/database', () => ({
  and: hoisted.andMock,
  db: {
    query: {
      user: {
        findFirst: hoisted.userFindFirstMock,
      },
      subscriptions: {
        findMany: hoisted.subscriptionFindManyMock,
      },
    },
  },
  eq: vi.fn(),
  subscriptions: {
    userId: 'subscriptions.user_id',
    tenantId: 'subscriptions.tenant_id',
  },
  user: {},
}));

vi.mock('@interdomestik/domain-membership-billing/subscription', () => ({
  getActiveSubscription: hoisted.getActiveSubscriptionMock,
}));

vi.mock('@/components/member-dashboard', () => ({
  ActiveClaimFocus: () => null,
  MemberEmptyState: () => <div data-testid="member-empty-state" />,
  MemberHeader: ({ name }: { name: string }) => <div>{name}</div>,
  PrimaryActions: () => <div data-testid="member-primary-actions" />,
  SupportLink: ({ href }: { href: string }) => <a href={href}>support</a>,
}));

vi.mock('@/components/member/HomeGrid', () => ({
  HomeGrid: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/member/referral-card', () => ({
  ReferralCard: () => <div data-testid="referral-card" />,
}));

vi.mock('./matte-anchor-card', () => ({
  MatteAnchorCard: ({ label, description }: { label: string; description: string }) => (
    <div>
      <span>{label}</span>
      <span>{description}</span>
    </div>
  ),
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/roles.core', () => ({
  isAgent: () => false,
}));

vi.mock('@interdomestik/ui', () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { MemberDashboardView } from './member-dashboard-view';

function makeData(overrides?: Partial<MemberDashboardData>): MemberDashboardData {
  return {
    member: {
      id: 'member-1',
      name: 'Stefan Dimitrioski',
      membershipNumber: 'M-100',
    },
    claims: [],
    activeClaimId: null,
    supportHref: '/member/help',
    ...overrides,
  };
}

function mockActiveMembership() {
  const activeSubscription = {
    id: 'sub-active',
    status: 'active',
    currentPeriodEnd: new Date('2026-09-30T00:00:00Z'),
  };
  hoisted.getActiveSubscriptionMock.mockResolvedValueOnce(activeSubscription);
  hoisted.subscriptionFindManyMock.mockResolvedValueOnce([activeSubscription]);
}

describe('MemberDashboardView MK localization', () => {
  beforeEach(() => {
    hoisted.userFindFirstMock.mockResolvedValue({
      id: 'member-1',
      name: 'Stefan Dimitrioski',
      role: 'member',
      memberNumber: 'ID-MEMBER',
      tenantId: 'tenant-ks',
    });
    hoisted.subscriptionFindManyMock.mockResolvedValue([]);
    hoisted.getActiveSubscriptionMock.mockResolvedValue(null);
  });

  it('does not leak hardcoded Albanian or English hero copy on mk member surface', async () => {
    const tree = await MemberDashboardView({
      data: makeData(),
      locale: 'mk',
    });

    render(tree);

    expect(screen.getByText(/Добредојде/)).toBeInTheDocument();
    expect(screen.getByText('Вашето членство сè уште не е активно.')).toBeInTheDocument();
    expect(screen.queryByText('Mirësevini,')).not.toBeInTheDocument();
    expect(screen.queryByText('Your membership is not active yet.')).not.toBeInTheDocument();
    expect(screen.queryByText('Live Protection')).not.toBeInTheDocument();
    expect(screen.queryByText('Explore All')).not.toBeInTheDocument();
    expect(
      screen.queryByText('dashboard.member_landing.card_member_support')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('dashboard.member_landing.support_panel_title')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('member-guidance-panel')).toBeInTheDocument();
    expect(screen.getByText('Вашиот најважен следен чекор')).toBeInTheDocument();
  });

  it('surfaces activation CTAs before claim-centric actions for unpaid members', async () => {
    const tree = await MemberDashboardView({
      data: makeData(),
      locale: 'mk',
    });

    render(tree);

    expect(screen.getByTestId('member-activation-panel')).toBeInTheDocument();
    expect(screen.getAllByText('Активирај го членството').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Отвори членство' })).toHaveAttribute(
      'href',
      '/member/membership'
    );
    expect(screen.getByRole('link', { name: 'Види планови' })).toHaveAttribute('href', '/pricing');
  });

  it.each([
    {
      description: 'trialing memberships',
      activeSubscription: {
        id: 'sub-trialing',
        status: 'trialing',
        currentPeriodEnd: new Date('2026-04-30T00:00:00Z'),
      },
    },
    {
      description: 'past_due memberships still inside grace',
      activeSubscription: {
        id: 'sub-grace',
        status: 'past_due',
        currentPeriodEnd: new Date('2026-04-30T00:00:00Z'),
        gracePeriodEndsAt: new Date('2099-04-05T00:00:00Z'),
      },
    },
  ])(
    'does not show activation panel for claim-eligible $description',
    async ({ activeSubscription }) => {
      hoisted.getActiveSubscriptionMock.mockResolvedValueOnce(activeSubscription);
      hoisted.subscriptionFindManyMock.mockResolvedValueOnce([activeSubscription]);

      const tree = await MemberDashboardView({
        data: makeData(),
        locale: 'mk',
      });

      render(tree);

      expect(screen.queryByTestId('member-activation-panel')).not.toBeInTheDocument();
      expect(
        screen.getByText('Вашето членство е активно. Подготвени сме да помогнеме.')
      ).toBeInTheDocument();
      expect(screen.getAllByText('Активно').length).toBeGreaterThan(0);
    }
  );

  it('keeps inactive no-claim guidance activation-oriented before claim intake', async () => {
    const tree = await MemberDashboardView({
      data: makeData(),
      locale: 'mk',
    });

    render(tree);

    expect(screen.getByTestId('member-guidance-activation')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Активирај членство' })[0]).toHaveAttribute(
      'href',
      '/member/membership'
    );
    expect(screen.getByRole('link', { name: 'Отвори документи' })).toHaveAttribute(
      'href',
      '/member/documents'
    );
  });

  it('guides active members with no claims toward the claim intake and document vault', async () => {
    mockActiveMembership();

    const tree = await MemberDashboardView({
      data: makeData(),
      locale: 'mk',
    });

    render(tree);

    expect(screen.getByTestId('member-guidance-start-claim')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Започни барање' })).toHaveAttribute(
      'href',
      '/member/claims/new'
    );
    expect(screen.getByRole('link', { name: 'Отвори документи' })).toHaveAttribute(
      'href',
      '/member/documents'
    );
  });

  it('surfaces active claim guidance and support readiness for claim-eligible members', async () => {
    mockActiveMembership();

    const tree = await MemberDashboardView({
      data: makeData({
        supportHref: '/member/help/tenant-support',
        activeClaimId: 'claim-1',
        claims: [
          {
            id: 'claim-1',
            claimNumber: 'CLM-100',
            status: 'evaluation',
            stageKey: 'evaluation',
            stageLabel: 'Evaluation',
            submittedAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-20T00:00:00.000Z',
            requiresMemberAction: false,
          },
        ],
      }),
      locale: 'mk',
    });

    render(tree);

    expect(screen.getByTestId('member-guidance-active-claim')).toBeInTheDocument();
    expect(screen.getByText('Барањето CLM-100 е во активниот тек.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Отвори барање' })).toHaveAttribute(
      'href',
      '/member/claims/claim-1'
    );
    expect(screen.getByText('Членството е активно')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Контактирај поддршка' })).toHaveAttribute(
      'href',
      '/member/help/tenant-support'
    );
  });

  it('uses the member action CTA when the active claim requires member input', async () => {
    mockActiveMembership();

    const tree = await MemberDashboardView({
      data: makeData({
        activeClaimId: 'claim-action',
        claims: [
          {
            id: 'claim-action',
            claimNumber: 'CLM-200',
            status: 'verification',
            stageKey: 'documents',
            stageLabel: 'Documents',
            submittedAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-20T00:00:00.000Z',
            requiresMemberAction: true,
            nextMemberAction: {
              label: 'Upload evidence',
              actionType: 'upload_document',
              href: '/member/claims/claim-action/documents',
            },
          },
        ],
      }),
      locale: 'mk',
    });

    render(tree);

    expect(screen.getByTestId('member-guidance-action-needed')).toBeInTheDocument();
    expect(
      screen.getByText('Барањето CLM-200 чека ваш внес за тимот да продолжи со тријажа.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upload evidence' })).toHaveAttribute(
      'href',
      '/member/claims/claim-action/documents'
    );
  });

  it('falls back to claim history guidance when no active claim is selected', async () => {
    mockActiveMembership();

    const tree = await MemberDashboardView({
      data: makeData({
        activeClaimId: null,
        claims: [
          {
            id: 'claim-closed',
            claimNumber: 'CLM-300',
            status: 'resolved',
            stageKey: 'closed',
            stageLabel: 'Closed',
            submittedAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-02-01T00:00:00.000Z',
            requiresMemberAction: false,
          },
        ],
      }),
      locale: 'mk',
    });

    render(tree);

    expect(screen.getByTestId('member-guidance-claims-history')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Види барања' })).toHaveAttribute(
      'href',
      '/member/claims'
    );
  });
});
