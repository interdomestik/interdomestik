import posthog from 'posthog-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClaimsEvents,
  FunnelEvents,
  RegistrationEvents,
  analytics,
  identifyUser,
  resetIdentity,
  resolveFunnelVariant,
  trackEvent,
} from './analytics';

// Mock posthog-js
vi.mock('posthog-js', () => ({
  default: {
    __loaded: true,
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
  },
}));

describe('analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure window is defined (mocked in vitest environment usually, but checking)
    // and __loaded is true by default from our mock
  });

  describe('trackEvent', () => {
    it('should call posthog.capture when loaded', () => {
      trackEvent('test_event', { foo: 'bar' });
      expect(posthog.capture).toHaveBeenCalledWith('test_event', { foo: 'bar' });
    });

    it('should not call posthog.capture when not loaded', () => {
      posthog.__loaded = false;
      trackEvent('test_event');
      expect(posthog.capture).not.toHaveBeenCalled();
      // Reset
      posthog.__loaded = true;
    });
  });

  describe('identifyUser', () => {
    it('should call posthog.identify', () => {
      identifyUser('user_123', { plan: 'premium' });
      expect(posthog.identify).toHaveBeenCalledWith('user_123', { plan: 'premium' });
    });
  });

  describe('resetIdentity', () => {
    it('should call posthog.reset', () => {
      resetIdentity();
      expect(posthog.reset).toHaveBeenCalled();
    });
  });

  describe('RegistrationEvents', () => {
    it('should track registration started', () => {
      RegistrationEvents.started();
      expect(posthog.capture).toHaveBeenCalledWith('registration_started', undefined);
    });

    it('should track registration completed', () => {
      RegistrationEvents.completed('mem_123');
      expect(posthog.capture).toHaveBeenCalledWith('registration_completed', {
        memberId: 'mem_123',
      });
    });

    it('should track registration failed', () => {
      RegistrationEvents.failed('error_msg');
      expect(posthog.capture).toHaveBeenCalledWith('registration_failed', { error: 'error_msg' });
    });
  });

  describe('ClaimsEvents', () => {
    it('should track wizard opened', () => {
      ClaimsEvents.wizardOpened();
      expect(posthog.capture).toHaveBeenCalledWith('claim_wizard_opened', undefined);
    });

    it('should track step completed', () => {
      ClaimsEvents.stepCompleted(1, 'details');
      expect(posthog.capture).toHaveBeenCalledWith('claim_step_completed', {
        step: 1,
        stepName: 'details',
      });
    });

    it('should track submitted', () => {
      ClaimsEvents.submitted('claim_abc');
      expect(posthog.capture).toHaveBeenCalledWith('claim_submitted', { claimId: 'claim_abc' });
    });

    it('should track failed', () => {
      ClaimsEvents.failed('network_error');
      expect(posthog.capture).toHaveBeenCalledWith('claim_failed', { error: 'network_error' });
    });
  });

  describe('resolveFunnelVariant', () => {
    it('returns hero_v2 when ui v2 is enabled', () => {
      expect(resolveFunnelVariant(true)).toBe('hero_v2');
    });

    it('returns hero_v1 when ui v2 is disabled', () => {
      expect(resolveFunnelVariant(false)).toBe('hero_v1');
    });
  });

  describe('FunnelEvents', () => {
    it('tracks landing with tenant_id and variant', () => {
      FunnelEvents.landingViewed({
        tenantId: 'tenant_ks',
        variant: 'hero_v2',
        locale: 'sq',
      });

      expect(posthog.capture).toHaveBeenCalledWith('funnel_landing_viewed', {
        tenant_id: 'tenant_ks',
        variant: 'hero_v2',
        locale: 'sq',
      });
    });

    it('falls back tenant_id to tenant_unknown when missing', () => {
      FunnelEvents.activationCompleted({
        tenantId: null,
        variant: 'hero_v2',
      });

      expect(posthog.capture).toHaveBeenCalledWith('funnel_activation_completed', {
        tenant_id: 'tenant_unknown',
        variant: 'hero_v2',
      });
    });

    it('tracks first claim submission with context and claim id', () => {
      FunnelEvents.firstClaimSubmitted(
        {
          tenantId: 'tenant_mk',
          variant: 'hero_v2',
        },
        {
          claim_id: 'clm_123',
        }
      );

      expect(posthog.capture).toHaveBeenCalledWith('funnel_first_claim_submitted', {
        tenant_id: 'tenant_mk',
        variant: 'hero_v2',
        claim_id: 'clm_123',
      });
    });

    it('tracks retention pulse with day bucket', () => {
      FunnelEvents.retentionPulse(
        {
          tenantId: 'tenant_al',
          variant: 'hero_v1',
        },
        {
          retention_day: 7,
        }
      );

      expect(posthog.capture).toHaveBeenCalledWith('retention_pulse', {
        tenant_id: 'tenant_al',
        variant: 'hero_v1',
        retention_day: 7,
      });
    });
  });

  describe('analytics compatibility object', () => {
    it('should map methods correctly', () => {
      analytics.track('compat_track');
      expect(posthog.capture).toHaveBeenCalledWith('compat_track', undefined);

      analytics.identify('u1');
      expect(posthog.identify).toHaveBeenCalledWith('u1', undefined);

      analytics.reset();
      expect(posthog.reset).toHaveBeenCalled();
    });
  });
});
