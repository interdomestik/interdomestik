import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertPostAuthSessionProbeStatus,
  emitSessionProbeSkippedAfterReadyTelemetry,
  normalizePathnameFamily,
  resolvePostAuthProbePlan,
} from './auth.actions';

describe('auth fixture probe reduction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips the post-auth probe after ready markers and emits telemetry', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    expect(
      resolvePostAuthProbePlan({
        readyMarkersVisible: true,
        probeMode: 'bootstrap',
      })
    ).toEqual({
      shouldProbe: false,
      shouldEmitSkipTelemetry: true,
    });

    emitSessionProbeSkippedAfterReadyTelemetry({
      tenant: 'ks',
      locale: 'sq',
      role: 'staff',
      origin: 'http://ks.127.0.0.1.nip.io:3000',
      pathname: '/sq/staff/claims/pack_ks_claim_123',
    });

    expect(infoSpy).toHaveBeenCalledOnce();

    const [rawPayload] = infoSpy.mock.calls[0];
    const payload = JSON.parse(String(rawPayload)) as {
      event_type: string;
      event_name: string;
      occurred_at: string;
      tenant: string;
      locale: string;
      surface: string;
      host_class: string;
      reason: string;
      pathname_family: string;
    };

    expect(payload).toMatchObject({
      event_type: 'auth_telemetry',
      event_name: 'session_probe_skipped_after_ready',
      tenant: 'ks',
      locale: 'sq',
      surface: 'staff',
      host_class: 'nipio',
      reason: 'ready_probe_skipped',
      pathname_family: '/staff/claims',
    });
    expect(new Date(payload.occurred_at).toISOString()).toBe(payload.occurred_at);
  });

  it('keeps explicit validation available after ready markers are visible', () => {
    expect(
      resolvePostAuthProbePlan({
        readyMarkersVisible: true,
        probeMode: 'validate',
      })
    ).toEqual({
      shouldProbe: true,
      shouldEmitSkipTelemetry: false,
    });
  });

  it.each([401, 403])('fails hard when an explicit probe returns %i', status => {
    expect(() => assertPostAuthSessionProbeStatus(status, 'staff')).toThrow();
  });

  it('normalizes pathname families', () => {
    expect(normalizePathnameFamily('/sq/login')).toBe('/login');
    expect(normalizePathnameFamily('/sq/staff/claims')).toBe('/staff/claims');
    expect(normalizePathnameFamily('/sq/admin/users/123')).toBe('/admin/users');
  });
});
