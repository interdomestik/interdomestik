import posthog from 'posthog-js';

/**
 * Track a custom analytics event.
 * Safe to call even if PostHog is not initialized.
 */
export function trackEvent(eventName: string, properties?: Record<string, unknown>) {
  if (typeof globalThis !== 'undefined' && posthog.__loaded) {
    posthog.capture(eventName, properties);
  }
}

export type FunnelVariant = 'hero_v1' | 'hero_v2';

type FunnelContext = {
  tenantId: string | null | undefined;
  variant: FunnelVariant;
  locale?: string;
};

type FunnelProperties = Record<string, unknown>;

function normalizeTenantId(tenantId: string | null | undefined): string {
  const normalized = tenantId?.trim();
  return normalized && normalized.length > 0 ? normalized : 'tenant_unknown';
}

function withFunnelContext(
  context: FunnelContext,
  properties?: FunnelProperties
): Record<string, unknown> {
  return {
    ...(properties ?? {}),
    tenant_id: normalizeTenantId(context.tenantId),
    variant: context.variant,
    ...(context.locale ? { locale: context.locale } : {}),
  };
}

export function resolveFunnelVariant(uiV2Enabled: boolean): FunnelVariant {
  return uiV2Enabled ? 'hero_v2' : 'hero_v1';
}

// ============================================================================
// Pre-defined Events for Critical Flows
// ============================================================================

/** User registration events */
export const RegistrationEvents = {
  started: () => trackEvent('registration_started'),
  completed: (memberId: string) => trackEvent('registration_completed', { memberId }),
  failed: (error: string) => trackEvent('registration_failed', { error }),
};

/** Claims events */
export const ClaimsEvents = {
  wizardOpened: () => trackEvent('claim_wizard_opened'),
  stepCompleted: (step: number, stepName: string) =>
    trackEvent('claim_step_completed', { step, stepName }),
  submitted: (claimId: string) => trackEvent('claim_submitted', { claimId }),
  failed: (error: string) => trackEvent('claim_failed', { error }),
};

export const FunnelEvents = {
  landingViewed: (context: FunnelContext, properties?: FunnelProperties) =>
    trackEvent('funnel_landing_viewed', withFunnelContext(context, properties)),
  activationCompleted: (context: FunnelContext, properties?: FunnelProperties) =>
    trackEvent('funnel_activation_completed', withFunnelContext(context, properties)),
  firstClaimSubmitted: (context: FunnelContext, properties?: FunnelProperties) =>
    trackEvent('funnel_first_claim_submitted', withFunnelContext(context, properties)),
  retentionPulse: (context: FunnelContext, properties?: FunnelProperties) =>
    trackEvent('retention_pulse', withFunnelContext(context, properties)),
};

/** User identification (link PostHog to your user ID) */
export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  if (typeof globalThis !== 'undefined' && posthog.__loaded) {
    posthog.identify(userId, traits);
  }
}

/** Reset user identity on logout */
export function resetIdentity() {
  if (typeof globalThis !== 'undefined' && posthog.__loaded) {
    posthog.reset();
  }
}

/**
 * Analytics object for backward compatibility with existing code.
 * Use this when you need analytics.track() style calls.
 */
export const analytics = {
  track: trackEvent,
  identify: identifyUser,
  reset: resetIdentity,
};
