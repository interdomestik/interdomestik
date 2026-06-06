import { describe, expect, it, vi } from 'vitest';

import {
  ENTERPRISE_ALERT_CONTRACT,
  captureEnterpriseAuthAlertTags,
  resolveEnterpriseAuthAlertTags,
} from './auth-enterprise-alert-tags';
import type { AuthTelemetryPayload } from './auth-telemetry';

const hoisted = vi.hoisted(() => ({
  captureMessage: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: hoisted.captureMessage,
}));

function makePayload(overrides: Partial<AuthTelemetryPayload>): AuthTelemetryPayload {
  return {
    event_type: 'auth_telemetry',
    event_name: 'protected_route_bounce_to_login',
    occurred_at: '2026-06-06T12:00:00.000Z',
    tenant: 'tenant_ks',
    locale: 'sq',
    surface: 'member',
    host_class: 'canonical',
    reason: 'inactive_session',
    pathname_family: '/member/claims',
    ...overrides,
  };
}

describe('auth enterprise alert tags', () => {
  it('tags protected-route failures with canonical route class only', () => {
    const payload = makePayload({
      surface: 'staff',
      pathname_family: '/staff/claims',
    });

    expect(resolveEnterpriseAuthAlertTags(payload)).toEqual({
      enterprise_alert: 'protected_route',
      alert_contract: ENTERPRISE_ALERT_CONTRACT,
      route_contract: 'canonical_protected_route',
      protected_route_class: 'staff',
    });
  });

  it('omits protected route class when the surface is not canonical', () => {
    expect(resolveEnterpriseAuthAlertTags(makePayload({ surface: 'unknown' }))).toEqual({
      enterprise_alert: 'protected_route',
      alert_contract: ENTERPRISE_ALERT_CONTRACT,
      route_contract: 'canonical_protected_route',
    });
  });

  it('tags session validation failures as auth-session alerts', () => {
    expect(
      resolveEnterpriseAuthAlertTags(
        makePayload({
          event_name: 'session_introspection_throttled',
          reason: 'throttled',
        })
      )
    ).toEqual({
      enterprise_alert: 'auth_session',
      alert_contract: ENTERPRISE_ALERT_CONTRACT,
    });
  });

  it('does not tag non-failure auth telemetry', () => {
    expect(
      resolveEnterpriseAuthAlertTags(
        makePayload({
          event_name: 'session_probe_skipped_after_ready',
          reason: 'ready_probe_skipped',
        })
      )
    ).toBeNull();
  });

  it('captures only contract-approved low-cardinality Sentry tags', () => {
    hoisted.captureMessage.mockClear();

    captureEnterpriseAuthAlertTags(
      makePayload({
        tenant: 'tenant_ks',
        pathname_family: '/member/claims',
      })
    );

    expect(hoisted.captureMessage).toHaveBeenCalledWith('enterprise_alert.protected_route', {
      level: 'warning',
      tags: {
        enterprise_alert: 'protected_route',
        alert_contract: ENTERPRISE_ALERT_CONTRACT,
        route_contract: 'canonical_protected_route',
        protected_route_class: 'member',
      },
      fingerprint: ['enterprise-alert', 'protected_route', 'member'],
    });
    expect(JSON.stringify(hoisted.captureMessage.mock.calls[0])).not.toContain('tenant_ks');
    expect(JSON.stringify(hoisted.captureMessage.mock.calls[0])).not.toContain('/member/claims');
  });
});
