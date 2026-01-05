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
  });

  it('returns false when CRON_SECRET is missing', () => {
    const result = authorizeCronRequest({ authorizationHeader: null, cronSecret: undefined });

    expect(result).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('CRON_SECRET is not configured');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns false when authorization header is invalid', () => {
    const result = authorizeCronRequest({
      authorizationHeader: 'Bearer wrong',
      cronSecret: 'secret',
    });

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith('Unauthorized cron request attempt detected');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('returns true when authorization header matches', () => {
    const result = authorizeCronRequest({
      authorizationHeader: 'Bearer secret',
      cronSecret: 'secret',
    });

    expect(result).toBe(true);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
