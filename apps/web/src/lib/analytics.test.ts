import posthog from 'posthog-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClaimsEvents,
  RegistrationEvents,
  analytics,
  identifyUser,
  resetIdentity,
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
