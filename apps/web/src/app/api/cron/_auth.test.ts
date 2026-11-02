import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authorizeCronRequest } from './_auth';

describe('authorizeCronRequest', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('returns null when CRON_SECRET is missing', () => {
    vi.stubEnv('CRON_SECRET', '');
    const result = authorizeCronRequest({ authorizationHeader: 'Bearer ' });

    expect(result).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('CRON_SECRET is not configured');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns null when authorization header is invalid', () => {
    vi.stubEnv('CRON_SECRET', 'secret');
    const result = authorizeCronRequest({ authorizationHeader: 'Bearer wrong' });

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('Unauthorized cron request attempt detected');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('returns null when the header is absent', () => {
    vi.stubEnv('CRON_SECRET', 'secret');
    expect(authorizeCronRequest({ authorizationHeader: null })).toBeNull();
  });

  it('returns an ingress capability when authorization header matches', () => {
    vi.stubEnv('CRON_SECRET', 'secret');
    const result = authorizeCronRequest({ authorizationHeader: 'Bearer secret' });

    expect(result).not.toBeNull();
    expect(Object.isFrozen(result)).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
