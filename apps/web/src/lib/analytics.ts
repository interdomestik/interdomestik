import posthog from 'posthog-js';

/**
 * Track a custom analytics event.
 * Safe to call even if PostHog is not initialized.
 */
export function trackEvent(eventName: string, properties?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && posthog.__loaded) {
    posthog.capture(eventName, properties);
  }
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

/** User identification (link PostHog to your user ID) */
export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && posthog.__loaded) {
    posthog.identify(userId, traits);
  }
}

/** Reset user identity on logout */
export function resetIdentity() {
  if (typeof window !== 'undefined' && posthog.__loaded) {
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
