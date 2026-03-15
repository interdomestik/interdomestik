import { describe, expect, it } from 'vitest';

import { buildCommercialHandlingScopeSnapshot } from './commercial-handling-scope';

describe('commercial handling scope', () => {
  it('marks launch recovery categories as eligible for staff-led recovery', () => {
    expect(buildCommercialHandlingScopeSnapshot({ claimCategory: ' vehicle ' })).toEqual({
      claimCategory: 'vehicle',
      decisionReason: 'launch_scope_supported',
      enforcementError: null,
      isEligible: true,
      staffDescription:
        'This claim matches the current launch recovery categories and can use staff-led recovery when the accepted-case prerequisites are ready.',
      staffLabel: 'Launch recovery category',
    });
  });

  it('blocks known guidance-only categories from success-fee handling', () => {
    expect(buildCommercialHandlingScopeSnapshot({ claimCategory: 'travel' })).toEqual({
      claimCategory: 'travel',
      decisionReason: 'outside_launch_scope',
      enforcementError:
        'This matter stays guidance-only or referral-only under the current launch scope and cannot move into staff-led recovery or success-fee handling.',
      isEligible: false,
      staffDescription:
        'This matter stays guidance-only or referral-only under the current launch scope.',
      staffLabel: 'Guidance-only or referral-only under current scope',
    });
  });

  it('blocks unknown or missing categories instead of inferring success-fee eligibility', () => {
    expect(buildCommercialHandlingScopeSnapshot({ claimCategory: '' })).toEqual({
      claimCategory: null,
      decisionReason: 'outside_launch_scope',
      enforcementError:
        'Launch recovery scope could not be confirmed from the stored claim category, so this matter cannot move into staff-led recovery or success-fee handling.',
      isEligible: false,
      staffDescription:
        'The stored claim category is missing, so keep this matter outside staff-led recovery and success-fee handling until the launch scope is confirmed.',
      staffLabel: 'Launch scope not confirmed',
    });
  });
});
