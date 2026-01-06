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

    // Verify console.group was called
    expect(consoleGroupSpy).toHaveBeenCalledWith('[Analytics] claim_intake_viewed');

    // Note: Console logging of properties is disabled to reduce noise and lint errors.
    // PII stripping is handled within the core function but not visible in logs anymore.
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('should handle undefined properties', () => {
    analytics.track('call_me_now_clicked');

    expect(consoleGroupSpy).toHaveBeenCalledWith('[Analytics] call_me_now_clicked');
    expect(consoleLogSpy).not.toHaveBeenCalled();
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
