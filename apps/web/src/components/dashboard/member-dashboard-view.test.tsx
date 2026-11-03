import { screen, within } from '@testing-library/react';
import enMessages from '@/messages/en/dashboard.json';
import mkMessages from '@/messages/mk/dashboard.json';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  byId,
  setDashboardMessages,
  expectHeroState,
  expectHref,
  expectNoMemberConversionHeroCta,
  h,
  makeClaim,
  makeData,
  mockActiveMembership,
  renderDashboard,
} from './member-dashboard-view.test-support';

describe('MemberDashboardView assistance dashboard', () => {
  beforeEach(() => {
    setDashboardMessages(mkMessages);
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
    setDashboardMessages(enMessages);
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
});
