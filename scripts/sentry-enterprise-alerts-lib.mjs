import { buildMetricAlertPayload, diffMetricAlertRules } from './sentry-alerts-lib.mjs';

export const ENTERPRISE_ALERT_CONTRACT = 'ent-alert09-auth-rls-protected-route-tags-v1';

const ENTERPRISE_CATEGORIES = Object.freeze(['auth_session', 'protected_route', 'tenant_boundary']);
const DOC_REFS = Object.freeze([
  'docs/plans/enterprise-readiness-register.md',
  'docs/plans/ent-alert09-auth-rls-protected-route-telemetry-tag-contract-2026-06-06.md',
  'docs/plans/ent-alert10-auth-rls-protected-route-runtime-tagging-foundation-2026-06-06.md',
  'docs/plans/ent-alert11-auth-rls-protected-route-provider-alert-catalog-contract-2026-06-06.md',
]);
const FORBIDDEN_QUERY_PARTS = Object.freeze([
  'tenantId',
  'tenant_id',
  'userId',
  'user_id',
  'branchId',
  'branch_id',
  'claimId',
  'claim_id',
  'documentId',
  'document_id',
  'email',
  'cookie',
  'token',
  'http.url',
  'url:',
  'path:',
]);
const BASE_ALERT = Object.freeze({
  docsRefs: DOC_REFS,
  dataset: 'events_analytics_platform',
  queryType: 1,
  aggregate: 'count()',
  timeWindow: 60,
  thresholdType: 0,
  thresholds: Object.freeze({ warning: 1, critical: 5 }),
});

export const ENTERPRISE_SENTRY_ALERTS = Object.freeze([
  Object.freeze({
    ...BASE_ALERT,
    id: 'ent-alert-auth-session-coverage',
    name: '[ENT] Auth/session failure coverage',
    category: 'auth_session',
    runtimeStatus: 'implemented',
    query: `enterprise_alert:auth_session alert_contract:${ENTERPRISE_ALERT_CONTRACT}`,
  }),
  Object.freeze({
    ...BASE_ALERT,
    id: 'ent-alert-protected-route-coverage',
    name: '[ENT] Protected route failure coverage',
    category: 'protected_route',
    runtimeStatus: 'implemented',
    query:
      `enterprise_alert:protected_route route_contract:canonical_protected_route ` +
      `alert_contract:${ENTERPRISE_ALERT_CONTRACT}`,
  }),
  Object.freeze({
    ...BASE_ALERT,
    id: 'ent-alert-tenant-boundary-coverage',
    name: '[ENT] Tenant boundary or RLS failure coverage',
    category: 'tenant_boundary',
    runtimeStatus: 'pending_runtime_tag',
    query: `enterprise_alert:tenant_boundary alert_contract:${ENTERPRISE_ALERT_CONTRACT}`,
  }),
]);

export function validateEnterpriseAlertCatalog(alerts, options = {}) {
  if (!Array.isArray(alerts)) return ['enterprise alert catalog must be an array'];

  const problems = [];
  const seenIds = new Set();
  const seenNames = new Set();
  const expectedCategories = new Set(ENTERPRISE_CATEGORIES);

  if (!options.allowSubset && alerts.length !== ENTERPRISE_CATEGORIES.length)
    problems.push(`expected ${ENTERPRISE_CATEGORIES.length} enterprise alerts, found ${alerts.length}`);

  for (const alert of alerts) {
    validateEnterpriseAlert(alert, { problems, seenIds, seenNames, expectedCategories });
  }

  if (!options.allowSubset) {
    const categories = new Set(alerts.map(alert => alert?.category).filter(Boolean));
    for (const category of expectedCategories)
      if (!categories.has(category))
        problems.push(`missing enterprise alert category: ${category}`);
  }

  return problems;
}

export function buildEnterpriseMetricAlertPayload(alert, context) {
  const problems = validateEnterpriseAlertCatalog([alert], { allowSubset: true });
  if (problems.length > 0)
    throw new Error(`Invalid enterprise alert definition: ${problems.join('; ')}`);

  return buildMetricAlertPayload(alert, context);
}

export function diffEnterpriseMetricAlertRules(options) {
  return diffMetricAlertRules({
    ...options,
    desired: options.desired ?? ENTERPRISE_SENTRY_ALERTS,
  });
}

function validateEnterpriseAlert(alert, context) {
  const { problems, seenIds, seenNames, expectedCategories } = context;
  if (!alert?.id) {
    problems.push('enterprise alert missing id');
    return;
  }

  if (seenIds.has(alert.id)) problems.push(`duplicate enterprise alert id: ${alert.id}`);
  seenIds.add(alert.id);

  if (!alert.name) problems.push(`enterprise alert ${alert.id} missing name`);
  if (seenNames.has(alert.name)) problems.push(`duplicate enterprise alert name: ${alert.name}`);
  seenNames.add(alert.name);

  if (!expectedCategories.has(alert.category))
    problems.push(`enterprise alert ${alert.id} has unsupported category: ${alert.category}`);
  if (!['implemented', 'pending_runtime_tag'].includes(alert.runtimeStatus))
    problems.push(`enterprise alert ${alert.id} has unsupported runtimeStatus`);
  if (alert.dataset !== 'events_analytics_platform') problems.push(`${alert.id} dataset drift`);
  if (alert.queryType !== 1) problems.push(`${alert.id} queryType drift`);
  if (alert.aggregate !== 'count()') problems.push(`${alert.id} aggregate drift`);
  if (alert.timeWindow !== 60) problems.push(`${alert.id} timeWindow drift`);
  if (alert.thresholdType !== 0) problems.push(`${alert.id} thresholdType drift`);
  if (alert.thresholds?.warning !== 1 || alert.thresholds?.critical !== 5)
    problems.push(`${alert.id} threshold drift`);
  validateQuery(alert, problems);
}

function validateQuery(alert, problems) {
  const query = alert.query ?? '';
  if (!query.includes(`enterprise_alert:${alert.category}`))
    problems.push(`enterprise alert ${alert.id} query missing category`);
  if (!query.includes(`alert_contract:${ENTERPRISE_ALERT_CONTRACT}`))
    problems.push(`enterprise alert ${alert.id} query missing alert contract`);
  for (const forbidden of FORBIDDEN_QUERY_PARTS) {
    if (query.includes(forbidden))
      problems.push(`enterprise alert ${alert.id} query includes forbidden term: ${forbidden}`);
  }
}
