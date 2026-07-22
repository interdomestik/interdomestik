type OnboardingPayload = {
  onboarding: { tenant: string; mode: 'resolved' | 'deferred' };
};

export function buildEmailOnboardingPayload(tenant: string, deferred: boolean): OnboardingPayload {
  return { onboarding: { tenant, mode: deferred ? 'deferred' : 'resolved' } };
}

export function buildSocialOnboardingPayload(tenant: string, deferred: boolean) {
  return { additionalData: buildEmailOnboardingPayload(tenant, deferred) };
}
