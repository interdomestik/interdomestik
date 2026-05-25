import { describe, expect, it } from 'vitest';

import { resolveMemberHomeHero, type VisitorHeroVariant } from './hero-resolver';
import type { DashboardClaim } from './types';

function makeClaim(overrides?: Partial<DashboardClaim>): DashboardClaim {
  return {
    claimNumber: 'CLM-100',
    id: 'claim-1',
    requiresMemberAction: false,
    stageKey: 'submitted',
    stageLabel: 'Submitted',
    status: 'submitted',
    submittedAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('resolveMemberHomeHero', () => {
  it.each<VisitorHeroVariant>(['visitor_general', 'visitor_broker_tpl', 'visitor_diaspora'])(
    'resolves %s as a conversion state',
    visitorVariant => {
      const hero = resolveMemberHomeHero({
        activeClaim: null,
        isActive: false,
        locale: 'en',
        visitorVariant,
      });

      expect(hero).toMatchObject({
        copyKey: `heroResolver.states.${visitorVariant}`,
        href: '/en/member/membership',
        primaryTestId: `hero-cta-${visitorVariant}`,
        state: visitorVariant,
      });
    }
  );

  it('resolves active member without a case to first-case assistance', () => {
    expect(
      resolveMemberHomeHero({
        activeClaim: null,
        isActive: true,
        locale: 'sq',
      })
    ).toMatchObject({
      copyKey: 'heroResolver.states.member_active_no_case',
      href: '/sq/member/claims/new',
      primaryTestId: 'hero-cta-open-first-case',
      state: 'member_active_no_case',
    });
  });

  it('resolves active member with an open case to case continuation', () => {
    expect(
      resolveMemberHomeHero({
        activeClaim: makeClaim({ id: 'claim-open' }),
        isActive: true,
        locale: 'mk',
      })
    ).toMatchObject({
      copyKey: 'heroResolver.states.member_active_has_open_case',
      href: '/mk/member/claims/claim-open',
      primaryTestId: 'hero-cta-open-active-case',
      state: 'member_active_has_open_case',
    });
  });

  it('resolves document upload action before generic open-case continuation', () => {
    expect(
      resolveMemberHomeHero({
        activeClaim: makeClaim({
          nextMemberAction: {
            actionType: 'upload_document',
            href: '/member/claims/claim-docs/documents',
            label: 'Upload documents',
          },
          requiresMemberAction: true,
        }),
        isActive: true,
        locale: 'en',
      })
    ).toMatchObject({
      copyKey: 'heroResolver.states.missing_documents',
      href: '/member/claims/claim-docs/documents',
      primaryTestId: 'hero-cta-upload-documents',
      state: 'missing_documents',
    });
  });

  it('resolves authorization stage to authorization action', () => {
    expect(
      resolveMemberHomeHero({
        activeClaim: makeClaim({
          id: 'claim-auth',
          stageKey: 'authorization_needed',
          stageLabel: 'Authorization needed',
        }),
        isActive: true,
        locale: 'sr',
      })
    ).toMatchObject({
      copyKey: 'heroResolver.states.authorization_needed',
      href: '/sr/member/claims/claim-auth',
      primaryTestId: 'hero-cta-sign-authorization',
      state: 'authorization_needed',
    });
  });
});
