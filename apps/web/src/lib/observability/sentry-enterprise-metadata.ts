import type { Event } from '@sentry/nextjs';
import { ENTERPRISE_ALERT_CONTRACT } from '../auth-enterprise-alert-tags';

const ENTERPRISE_CATEGORIES = new Set(['auth_session', 'protected_route']);
function isProtectedRouteClass(value: unknown): value is string {
  return value === 'member' || value === 'agent' || value === 'staff' || value === 'admin';
}

/** Preserve the existing alert contract only as one coherent source-owned metadata group. */
function enterpriseAlertMetadata(event: Event) {
  const tags = event.tags;
  if (tags?.alert_contract !== ENTERPRISE_ALERT_CONTRACT) return undefined;
  const category = tags.enterprise_alert;
  if (
    typeof category !== 'string' ||
    !ENTERPRISE_CATEGORIES.has(category) ||
    event.message !== `enterprise_alert.${category}`
  )
    return undefined;
  const fixedTags: Record<string, string> = {
    enterprise_alert: category,
    alert_contract: ENTERPRISE_ALERT_CONTRACT,
  };
  if (category === 'protected_route') {
    if (tags.route_contract !== 'canonical_protected_route') return undefined;
    fixedTags.route_contract = 'canonical_protected_route';
    const routeClass = tags.protected_route_class;
    if (isProtectedRouteClass(routeClass)) fixedTags.protected_route_class = routeClass;
  }
  return {
    message: `enterprise_alert.${category}`,
    tags: fixedTags,
    fingerprint: [
      'enterprise-alert',
      category,
      fixedTags.protected_route_class ?? 'route_class_none',
    ],
  };
}
export function applyEnterpriseAlertMetadata(event: Event, result: Event): void {
  const metadata = enterpriseAlertMetadata(event);
  if (!metadata) return;
  result.message = metadata.message;
  result.tags = { ...result.tags, ...metadata.tags };
  result.fingerprint = metadata.fingerprint;
}
