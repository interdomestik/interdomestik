import { LOCALES } from '@/i18n/locales';
import { isSafeRouteSegment } from './sentry-route-vocabulary';
export { isSafeRouteSegment } from './sentry-route-vocabulary';

// Explicit privacy allowlist reviewed against src/app at c4188c544, never runtime route authority.
// Normalize only source parameter names; concrete slugs cannot fill these :id positions.
const ROUTE_SHAPES = new Set([
  '/:id',
  '/:id/about',
  '/:id/admin',
  '/:id/admin/account',
  '/:id/admin/agents',
  '/:id/admin/analytics',
  '/:id/admin/branches',
  '/:id/admin/branches/:id',
  '/:id/admin/claims',
  '/:id/admin/claims/:id',
  '/:id/admin/claims/number/:id',
  '/:id/admin/commissions',
  '/:id/admin/crm',
  '/:id/admin/leads',
  '/:id/admin/members/number/:id',
  '/:id/admin/overview',
  '/:id/admin/settings',
  '/:id/admin/sponsors',
  '/:id/admin/sponsors/:id',
  '/:id/admin/sponsors/:id/terms/:id',
  '/:id/admin/sponsors/tasks',
  '/:id/admin/staff',
  '/:id/admin/users',
  '/:id/admin/users/:id',
  '/:id/agent',
  '/:id/agent/claims',
  '/:id/agent/clients',
  '/:id/agent/clients/:id',
  '/:id/agent/clients/new',
  '/:id/agent/commissions',
  '/:id/agent/crm',
  '/:id/agent/import',
  '/:id/agent/leads',
  '/:id/agent/leads/:id',
  '/:id/agent/leads/new',
  '/:id/agent/members',
  '/:id/agent/members/:id',
  '/:id/agent/pos',
  '/:id/agent/settings',
  '/:id/agent/sponsors',
  '/:id/agent/sponsors/:id',
  '/:id/agent/sponsors/:id/terms/:id',
  '/:id/agent/toolkit/campaign',
  '/:id/agent/toolkit/guides',
  '/:id/agent/workspace',
  '/:id/agent/workspace/claims',
  '/:id/agent/workspace/leads',
  '/:id/business-membership',
  '/:id/dashboard/:id',
  '/:id/forgot-password',
  '/:id/help-now',
  '/:id/legal/cookies',
  '/:id/legal/privacy',
  '/:id/legal/refund',
  '/:id/legal/terms',
  '/:id/login',
  '/:id/login/tenant-context',
  '/:id/member',
  '/:id/member/benefits',
  '/:id/member/claim-report',
  '/:id/member/claims',
  '/:id/member/claims/:id',
  '/:id/member/claims/new',
  '/:id/member/diaspora',
  '/:id/member/documents',
  '/:id/member/green-card',
  '/:id/member/help',
  '/:id/member/incident-guide',
  '/:id/member/membership',
  '/:id/member/membership/card',
  '/:id/member/membership/success',
  '/:id/member/policies',
  '/:id/member/policies/upload',
  '/:id/member/rights',
  '/:id/member/settings',
  '/:id/nps/:id',
  '/:id/partners',
  '/:id/pricing',
  '/:id/register',
  '/:id/reset-password',
  '/:id/services',
  '/:id/sponsor/opt-out/:id',
  '/:id/staff',
  '/:id/staff/claims',
  '/:id/staff/claims/:id',
  '/:id/staff/crm',
  '/:id/staff/settings',
  '/:id/staff/sponsors',
  '/:id/staff/sponsors/:id',
  '/:id/staff/sponsors/:id/terms/:id',
  '/:id/staff/sponsors/tasks',
  '/:id/staff/support-handoffs',
  '/:id/stats',
  '/api/_debug/auth',
  '/api/_debug/env',
  '/api/ai/reviews/:id',
  '/api/ai/runs/:id',
  '/api/auth/:id',
  '/api/auth/sign-in/email',
  '/api/auth/login-session',
  '/api/claims',
  '/api/claims/evidence-upload',
  '/api/cron/crm/forecast-snapshots',
  '/api/cron/crm/forecast-snapshots/backfill',
  '/api/cron/dunning',
  '/api/cron/engagement',
  '/api/cron/nps',
  '/api/cron/sponsors',
  '/api/csp-report',
  '/api/documents/:id',
  '/api/documents/:id/download',
  '/api/e2e/branches',
  '/api/health',
  '/api/inngest',
  '/api/policies/analyze',
  '/api/privacy/data-deletion',
  '/api/public/nps',
  '/api/public/sponsor-opt-out',
  '/api/register',
  '/api/settings/notifications',
  '/api/settings/push',
  '/api/share-pack',
  '/api/simple-register',
  '/api/uploads',
  '/api/verification/:id',
  '/api/webhooks/paddle',
  '/api/webhooks/paddle/:id',
  '/track',
  '/track/:id',
]);
const BUILD_DIRECTORIES = new Set(
  [...ROUTE_SHAPES].flatMap(route => {
    const segments = route.slice(1).split('/');
    return ['/', ...segments.map((_, index) => '/' + segments.slice(0, index + 1).join('/'))];
  })
);

// Also recognize the canonical unprefixed routes. This is telemetry-only and
// neither selects a tenant nor authorizes a request.
const CONCRETE_SHAPES = [...ROUTE_SHAPES].flatMap(shape => {
  const segments = shape.slice(1).split('/');
  return shape.startsWith('/:id') ? [segments, segments.slice(1)] : [segments];
});

type RouteCandidate = { matched: string[]; literals: number };

function matchRoutePrefix(shape: string[], segments: string[]): RouteCandidate {
  const matched: string[] = [];
  let literals = 0;
  for (let index = 0; index < Math.min(shape.length, segments.length); index++) {
    const segment = segments[index];
    const expected = shape[index];
    if (expected !== ':id' && expected !== segment) break;
    if (expected !== ':id') literals++;
    const isLocale = index === 0 && LOCALES.includes(segment as (typeof LOCALES)[number]);
    matched.push(expected === ':id' && !isLocale ? ':id' : segment);
  }
  return { matched, literals };
}

function isBetterRouteCandidate(candidate: RouteCandidate, best: RouteCandidate): boolean {
  return (
    candidate.matched.length > best.matched.length ||
    (candidate.matched.length === best.matched.length && candidate.literals > best.literals)
  );
}

/** Preserve literals only at positions established by the longest source route prefix. */
export function toSafeRouteFamily(path: string): string {
  if (!path.startsWith('/') || path.length > 1024) return '/:id';
  const segments = path
    .split('/')
    .filter(Boolean)
    .slice(0, 10)
    .map(segment => {
      try {
        return decodeURIComponent(segment).toLowerCase();
      } catch {
        return ':id';
      }
    });
  let best: RouteCandidate = { matched: [], literals: -1 };
  for (const shape of CONCRETE_SHAPES) {
    const candidate = matchRoutePrefix(shape, segments);
    if (isBetterRouteCandidate(candidate, best)) best = candidate;
  }
  return '/' + [...best.matched, ...segments.slice(best.matched.length).map(() => ':id')].join('/');
}

function routeShape(path: string): string | undefined {
  if (!path.startsWith('/') || path.length > 1024) return undefined;
  if (path === '/') return path;
  const segments = path.slice(1).split('/');
  if (!segments.every(isSafeRouteSegment)) return undefined;
  return (
    '/' +
    segments
      .filter(segment => !segment.startsWith('(') && !segment.startsWith('@'))
      .map((segment, index) =>
        segment.startsWith('[') ||
        segment === ':id' ||
        (index === 0 && LOCALES.includes(segment as (typeof LOCALES)[number]))
          ? ':id'
          : segment
      )
      .join('/')
  );
}

export function isSafeRoutePattern(path: string): boolean {
  const shape = routeShape(path);
  return shape !== undefined && ROUTE_SHAPES.has(shape);
}

export function isSafeBuildRoute(path: string): boolean {
  const shape = routeShape(path);
  return shape !== undefined && BUILD_DIRECTORIES.has(shape);
}
