import * as Sentry from '@sentry/nextjs';

import type { AuthTelemetryPayload, AuthTelemetrySurface } from './auth-telemetry';

export const ENTERPRISE_ALERT_CONTRACT = 'ent-alert09-auth-rls-protected-route-tags-v1';

type EnterpriseAlertCategory = 'auth_session' | 'protected_route';
type ProtectedRouteClass = Exclude<AuthTelemetrySurface, 'unknown'>;

type EnterpriseAlertTags = {
  enterprise_alert: EnterpriseAlertCategory;
  alert_contract: typeof ENTERPRISE_ALERT_CONTRACT;
  protected_route_class?: ProtectedRouteClass;
  route_contract?: 'canonical_protected_route';
};

function isProtectedRouteClass(surface: AuthTelemetrySurface): surface is ProtectedRouteClass {
  return surface === 'member' || surface === 'agent' || surface === 'staff' || surface === 'admin';
}

export function resolveEnterpriseAuthAlertTags(
  payload: AuthTelemetryPayload
): EnterpriseAlertTags | null {
  if (payload.event_name === 'protected_route_bounce_to_login') {
    return {
      enterprise_alert: 'protected_route',
      alert_contract: ENTERPRISE_ALERT_CONTRACT,
      route_contract: 'canonical_protected_route',
      ...(isProtectedRouteClass(payload.surface) ? { protected_route_class: payload.surface } : {}),
    };
  }

  if (
    payload.event_name === 'session_introspection_throttled' ||
    payload.event_name === 'staff_post_login_redirect_failed'
  ) {
    return {
      enterprise_alert: 'auth_session',
      alert_contract: ENTERPRISE_ALERT_CONTRACT,
    };
  }

  return null;
}

export function captureEnterpriseAuthAlertTags(payload: AuthTelemetryPayload): void {
  const tags = resolveEnterpriseAuthAlertTags(payload);
  if (!tags) return;

  Sentry.captureMessage(`enterprise_alert.${tags.enterprise_alert}`, {
    level: 'warning',
    tags,
    fingerprint: [
      'enterprise-alert',
      tags.enterprise_alert,
      tags.protected_route_class ?? 'route_class_none',
    ],
  });
}
