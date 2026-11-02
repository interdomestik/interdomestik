import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { screen } from '@testing-library/react';
import enMessages from '@/messages/en/dashboard.json';
import mkMessages from '@/messages/mk/dashboard.json';
import sqMessages from '@/messages/sq/dashboard.json';
import srMessages from '@/messages/sr/dashboard.json';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  REQUIRED_MEMBER_ASSISTANCE_KEYS,
  byId,
  setDashboardMessages,
  expectHeroState,
  expectHref,
  expectNoMemberConversionHeroCta,
  getPath,
  h,
  makeClaim,
  makeData,
  mockActiveMembership,
  renderDashboard,
} from './member-dashboard-view.test-support';
import { getDashboardSupplementalData } from './member-dashboard-view';

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
      setDashboardMessages(enMessages);
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
    const MEMBER_AUTHORITY = mintTestTenantAuthority('tenant-ks', { userId: 'member-fulfilled' });
    await expect(
      getDashboardSupplementalData({ memberId: 'member-missing', authority: null })
    ).resolves.toEqual([null, 0, false]);
    h.active.mockResolvedValueOnce(null);
    await expect(
      getDashboardSupplementalData({ memberId: 'member-fulfilled', authority: MEMBER_AUTHORITY })
    ).resolves.toEqual([null, 0, true]);
    expect(h.active.mock.calls.at(-1)?.[1]).toBe(MEMBER_AUTHORITY);
    expect(h.withTenant.mock.calls.at(-1)?.[0]).toBe(MEMBER_AUTHORITY);
    h.active.mockRejectedValueOnce(new Error('subscription unavailable'));
    await expect(
      getDashboardSupplementalData({ memberId: 'member-rejected', authority: MEMBER_AUTHORITY })
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
