import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emitAuthTelemetryEvent,
  normalizeAuthPathnameFamily,
  normalizeAuthTelemetryPayload,
} from './auth-telemetry';

describe('auth telemetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T21:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('emits exactly one structured console line with a flat payload', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    emitAuthTelemetryEvent({
      eventName: 'protected_route_bounce_to_login',
      tenant: 'tenant_ks',
      locale: 'sq',
      surface: 'staff',
      host: 'ks.127.0.0.1.nip.io',
      pathname: '/sq/staff/claims/pack_ks_claim_123',
      reason: 'inactive_session',
      extra: { nested: true },
      callbackURL: 'https://example.com/callback',
    } as never);

    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);

    const [firstCall] = consoleInfoSpy.mock.calls;
    expect(firstCall).toHaveLength(1);
    expect(typeof firstCall[0]).toBe('string');

    const payload = JSON.parse(firstCall[0] as string);
    expect(payload).toEqual({
      event_type: 'auth_telemetry',
      event_name: 'protected_route_bounce_to_login',
      occurred_at: '2026-03-25T21:00:00.000Z',
      tenant: 'tenant_ks',
      locale: 'sq',
      surface: 'staff',
      host_class: 'nipio',
      reason: 'inactive_session',
      pathname_family: '/staff/claims',
    });
    expect(Object.keys(payload)).toEqual([
      'event_type',
      'event_name',
      'occurred_at',
      'tenant',
      'locale',
      'surface',
      'host_class',
      'reason',
      'pathname_family',
    ]);
  });

  it('normalizes pathname families to stable route groups', () => {
    expect(normalizeAuthPathnameFamily('/sq/login')).toBe('/login');
    expect(normalizeAuthPathnameFamily('/sq/staff/claims')).toBe('/staff/claims');
    expect(normalizeAuthPathnameFamily('/sq/staff/claims/pack_ks_claim_123')).toBe('/staff/claims');
    expect(normalizeAuthPathnameFamily('/sq/admin/users/123')).toBe('/admin/users');
  });

  it('returns a flat scalar payload when normalizing unsupported fields', () => {
    const payload = normalizeAuthTelemetryPayload({
      eventName: 'session_probe_skipped_after_ready',
      tenant: 'tenant_al',
      locale: 'mk',
      surface: 'unknown',
      host: 'localhost:3000',
      pathname: '/mk/member',
      reason: 'ready_probe_skipped',
      nested: { bad: true },
      callbackURL: 'https://example.com/redirect',
    } as never);

    expect(payload).toEqual({
      event_type: 'auth_telemetry',
      event_name: 'session_probe_skipped_after_ready',
      occurred_at: '2026-03-25T21:00:00.000Z',
      tenant: 'tenant_al',
      locale: 'mk',
      surface: 'unknown',
      host_class: 'localhost',
      reason: 'ready_probe_skipped',
      pathname_family: '/member',
    });
    expect(Object.values(payload).every(value => typeof value === 'string')).toBe(true);
  });
});
