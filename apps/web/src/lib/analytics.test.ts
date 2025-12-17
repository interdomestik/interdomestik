import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analytics } from './analytics';

type Spy = ReturnType<typeof vi.spyOn>;

describe('Analytics Utils', () => {
  let consoleGroupSpy: Spy;
  let consoleLogSpy: Spy;

  beforeEach(() => {
    consoleGroupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should strip PII from properties', () => {
    // In test env, it should hit the !IS_PROD block and log safeProps
    analytics.track('claim_intake_viewed', {
      claimId: '123',
      name: 'Secret Name',
      email: 'secret@example.com',
      phone: '555-5555',
      address: '123 Main St',
      other: 'safe',
    });

    // Verify console.log was called with Safe Properties
    expect(consoleLogSpy).toHaveBeenCalledWith('Safe Properties:', {
      claimId: '123',
      other: 'safe',
    });

    // Ensure PII keys are NOT present in the logged object
    const loggedProps = consoleLogSpy.mock.calls.find((call: unknown[]) => {
      return Array.isArray(call) && call[0] === 'Safe Properties:';
    })?.[1] as Record<string, unknown> | undefined;

    expect(loggedProps).toBeDefined();
    expect(loggedProps).not.toHaveProperty('name');
    expect(loggedProps).not.toHaveProperty('email');
    expect(loggedProps).not.toHaveProperty('phone');
    expect(loggedProps).not.toHaveProperty('address');
  });

  it('should handle undefined properties', () => {
    analytics.track('call_me_now_clicked');

    expect(consoleGroupSpy).toHaveBeenCalledWith('[Analytics] call_me_now_clicked');
    expect(consoleLogSpy).toHaveBeenCalledWith('Safe Properties:', {});
  });

  it('should not log in production mode', async () => {
    // Use stubEnv to mock production environment
    vi.stubEnv('NODE_ENV', 'production');

    // Reset modules to pick up new env
    vi.resetModules();
    const { analytics: prodAnalytics } = await import('./analytics');

    prodAnalytics.track('claim_intake_viewed', { claimId: '123' });

    // In production, console.group should not be called
    expect(consoleGroupSpy).not.toHaveBeenCalled();

    // Restore env
    vi.unstubAllEnvs();
  });
});
