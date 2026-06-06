import {
  ENTERPRISE_SENTRY_ALERTS,
  buildEnterpriseMetricAlertPayload,
  diffEnterpriseMetricAlertRules,
} from './sentry-enterprise-alerts-lib.mjs';
import {
  deriveEnterpriseRoutingFromD07Rules,
  summarizeRoutingForOutput,
} from './sentry-enterprise-routing-lib.mjs';
import { findMissingScopes } from './sentry-alerts-lib.mjs';

const SENTRY_API_ORIGIN = 'https://sentry.io';
const SENTRY_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export async function checkEnterpriseAlerts(config) {
  if (!config.authToken || !config.org || !config.project) {
    return {
      mode: 'catalog-only',
      alerts: ENTERPRISE_SENTRY_ALERTS,
      note: 'Remote comparison skipped because Sentry configuration is incomplete.',
    };
  }

  const orgSlug = requireSentrySlug(config.org, 'SENTRY_ORG');
  const headers = { Authorization: `Bearer ${config.authToken}` };
  ensureScopes(await fetchSentryAuthInfo({ headers }), ['alerts:read']);
  const remoteRules = await fetchMetricAlertRules(orgSlug, { headers });
  const remoteEntRules = remoteRules.filter(rule => rule.name.startsWith('[ENT] '));
  const diff = diffEnterpriseMetricAlertRules({
    remote: remoteEntRules,
    project: config.project,
    environment: config.environment,
    actionsByLabel: { critical: [], warning: [] },
    owner: config.owner || null,
    compareActions: false,
    compareOwner: Boolean(config.owner),
  });

  return {
    mode: 'remote-check',
    project: config.project,
    environment: config.environment,
    missing: diff.missing.map(alert => alert.name),
    changed: diff.changed.map(item => item.desired.name),
    unchanged: diff.unchanged.map(alert => alert.name),
    remoteEnterpriseRules: remoteEntRules.map(rule => ({ id: rule.id, name: rule.name })),
  };
}

export async function applyEnterpriseAlerts(config, options = {}) {
  if (!options.reuseD07Routing)
    throw new Error('Enterprise apply requires --reuse-d07-routing for this repo workflow.');
  requireRemoteConfig(config);
  const orgSlug = requireSentrySlug(config.org, 'SENTRY_ORG');
  const headers = { Authorization: `Bearer ${config.authToken}` };
  ensureScopes(await fetchSentryAuthInfo({ headers }), ['alerts:read', 'alerts:write']);
  const remoteRules = await fetchMetricAlertRules(orgSlug, { headers });
  const routing = resolveEnterpriseRouting(remoteRules, config, options);
  const remoteByName = new Map(remoteRules.map(rule => [rule.name, rule]));
  const results = [];

  for (const alert of ENTERPRISE_SENTRY_ALERTS) {
    const payload = buildEnterpriseMetricAlertPayload(alert, {
      project: config.project,
      environment: config.environment,
      owner: routing.owner,
      actionsByLabel: routing.actionsByLabel,
    });
    const existing = remoteByName.get(payload.name);
    const applied = existing
      ? await putMetricAlertRule(orgSlug, existing.id, payload, { headers })
      : await postMetricAlertRule(orgSlug, payload, { headers });
    results.push({
      id: alert.id,
      operation: existing ? 'updated' : 'created',
      remoteId: applied.id,
      name: applied.name,
    });
  }

  return {
    mode: 'apply',
    project: config.project,
    environment: config.environment,
    routing: summarizeRoutingForOutput(routing),
    results,
  };
}

function resolveEnterpriseRouting(remoteRules, config, options) {
  return deriveEnterpriseRoutingFromD07Rules(remoteRules, { owner: config.owner || null });
}

function requireRemoteConfig(config) {
  const missing = ['authToken', 'org', 'project'].filter(key => !config[key]);
  if (missing.length > 0)
    throw new Error(`Missing required Sentry configuration: ${missing.join(', ')}`);
}

function requireSentrySlug(value, label) {
  if (!SENTRY_SLUG_PATTERN.test(value))
    throw new Error(`${label} must be a Sentry slug, not a URL or path.`);
  return value;
}

async function fetchSentryAuthInfo(init) {
  return fetchSentryJson('/api/0/', init);
}

async function fetchMetricAlertRules(orgSlug, init) {
  return fetchSentryJson(`/api/0/organizations/${encodeURIComponent(orgSlug)}/alert-rules/`, init);
}

async function postMetricAlertRule(orgSlug, payload, init) {
  return fetchSentryJson(`/api/0/organizations/${encodeURIComponent(orgSlug)}/alert-rules/`, {
    ...init,
    method: 'POST',
    headers: { ...init.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function putMetricAlertRule(orgSlug, ruleId, payload, init) {
  return fetchSentryJson(
    `/api/0/organizations/${encodeURIComponent(orgSlug)}/alert-rules/${ruleId}/`,
    {
      ...init,
      method: 'PUT',
      headers: { ...init.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

async function fetchSentryJson(path, init) {
  const response = await fetch(`${SENTRY_API_ORIGIN}${path}`, init);
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`Sentry API request failed (${response.status}): ${bodyText}`);
  return bodyText ? JSON.parse(bodyText) : null;
}

function ensureScopes(authInfo, requiredScopes) {
  const missing = findMissingScopes(authInfo?.auth?.scopes ?? [], requiredScopes);
  if (missing.length > 0)
    throw new Error(`Sentry auth token is missing scopes: ${missing.join(', ')}`);
}
