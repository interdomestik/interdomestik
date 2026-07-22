import { describe, expect, it } from 'vitest';

import {
  buildEmailOnboardingPayload,
  buildSocialOnboardingPayload,
} from './register-onboarding-payload';

const authorityNames = [
  'role',
  'tenantId',
  'branchId',
  'memberNumber',
  'tenantClassificationPending',
  'agentId',
  'referralCode',
];

describe('registration onboarding payload', () => {
  it.each([false, true])('emits a selector, never persisted authority names (%s)', deferred => {
    const email = buildEmailOnboardingPayload('tenant_ks', deferred);
    const social = buildSocialOnboardingPayload('tenant_ks', deferred);
    const serialized = JSON.stringify({ email, social });

    expect(email).toEqual({
      onboarding: { tenant: 'tenant_ks', mode: deferred ? 'deferred' : 'resolved' },
    });
    expect(social).toEqual({ additionalData: email });
    for (const name of authorityNames) expect(serialized).not.toContain(`"${name}"`);
  });
});
