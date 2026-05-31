import { describe, expect, it } from 'vitest';

import {
  isAuthorizationStage,
  resolveClaimActionKind,
  resolveMemberHomeHero,
  type VisitorHeroVariant,
} from './hero-resolver';
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

  it('resolves authorization stage before generic non-upload member action', () => {
    expect(
      resolveMemberHomeHero({
        activeClaim: makeClaim({
          id: 'claim-auth-action',
          nextMemberAction: {
            actionType: 'provide_info',
            href: '/member/claims/claim-auth-action/documents/authorization.pdf',
            label: 'Review authorization file',
          },
          requiresMemberAction: true,
          stageKey: 'authorization_needed',
          stageLabel: 'Authorization needed',
        }),
        isActive: true,
        locale: 'en',
      })
    ).toMatchObject({
      copyKey: 'heroResolver.states.authorization_needed',
      href: '/en/member/claims/claim-auth-action',
      primaryTestId: 'hero-cta-sign-authorization',
      state: 'authorization_needed',
    });
  });

  it.each([
    [
      'review_offer',
      '/member/claims/claim-offer/offer',
      'heroResolver.states.member_action.actions.review_offer.cta',
      'heroResolver.states.member_action.actions.review_offer.ariaLabel',
    ],
    [
      'provide_info',
      '/member/claims/claim-info/request',
      'heroResolver.states.member_action.actions.provide_info.cta',
      'heroResolver.states.member_action.actions.provide_info.ariaLabel',
    ],
  ] as const)(
    'resolves %s as the generic member-action hero state',
    (actionType, href, ctaKey, ariaLabelKey) => {
      expect(
        resolveMemberHomeHero({
          activeClaim: makeClaim({
            claimNumber: 'CLM-ACTION',
            id: `claim-${actionType}`,
            nextMemberAction: {
              actionType,
              href,
              label: 'Free-form action label',
            },
            requiresMemberAction: true,
            stageKey: 'verification',
          }),
          isActive: true,
          locale: 'en',
        })
      ).toMatchObject({
        ariaLabelKey,
        copyKey: 'heroResolver.states.member_action',
        ctaKey,
        href,
        primaryTestId: 'hero-cta-member-action',
        state: 'member_action',
        translationValues: {
          claimReference: 'CLM-ACTION',
        },
      });
    }
  );

  it('falls back to open-case hero for an unrecognized runtime member action type', () => {
    expect(
      resolveMemberHomeHero({
        activeClaim: makeClaim({
          id: 'claim-unknown-action',
          nextMemberAction: {
            actionType: 'sign_document' as NonNullable<
              DashboardClaim['nextMemberAction']
            >['actionType'],
            href: '/member/claims/claim-unknown-action/sign',
            label: 'Sign document',
          },
          requiresMemberAction: true,
          stageKey: 'verification',
        }),
        isActive: true,
        locale: 'en',
      })
    ).toMatchObject({
      copyKey: 'heroResolver.states.member_active_has_open_case',
      href: '/en/member/claims/claim-unknown-action',
      primaryTestId: 'hero-cta-open-active-case',
      state: 'member_active_has_open_case',
    });
  });

  it('keeps upload documents before authorization and generic member actions', () => {
    expect(
      resolveClaimActionKind(
        makeClaim({
          nextMemberAction: {
            actionType: 'upload_document',
            href: '/member/claims/claim-docs/documents',
            label: 'Upload documents',
          },
          requiresMemberAction: true,
          stageKey: 'authorization_needed',
        })
      )
    ).toBe('missing_documents');

    expect(
      resolveClaimActionKind(
        makeClaim({
          nextMemberAction: {
            actionType: 'provide_info',
            href: '/member/claims/claim-auth/documents/authorization.pdf',
            label: 'Review authorization file',
          },
          requiresMemberAction: true,
          stageKey: 'authorization_needed',
        })
      )
    ).toBe('authorization_needed');

    expect(
      resolveClaimActionKind(
        makeClaim({
          nextMemberAction: {
            actionType: 'provide_info',
            href: '/member/claims/claim-action',
            label: 'Review request',
          },
          requiresMemberAction: true,
          stageKey: 'verification',
        })
      )
    ).toBe('member_action');
  });

  it.each(['authorization_needed', 'authorisation_required', 'autorizim_pending'])(
    'treats %s as an authorization stage key',
    stageKey => {
      expect(isAuthorizationStage(stageKey)).toBe(true);
    }
  );

  it('does not infer authorization from labels, hrefs, or filenames outside stage keys', () => {
    const hero = resolveMemberHomeHero({
      activeClaim: makeClaim({
        claimNumber: 'AUTH-FILE-100',
        id: 'claim-review',
        nextMemberAction: {
          actionType: 'provide_info',
          href: '/member/claims/claim-review/documents/authorization.pdf',
          label: 'Review authorization file',
        },
        requiresMemberAction: true,
        stageKey: 'verification',
        stageLabel: 'Authorization needed',
      }),
      isActive: true,
      locale: 'en',
    });

    expect(hero).toMatchObject({
      copyKey: 'heroResolver.states.member_action',
      ctaKey: 'heroResolver.states.member_action.actions.provide_info.cta',
      href: '/member/claims/claim-review/documents/authorization.pdf',
      primaryTestId: 'hero-cta-member-action',
      state: 'member_action',
    });
  });
});
