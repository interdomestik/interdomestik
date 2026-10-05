#!/usr/bin/env node
import {
  RESPONSIVENESS_ALERTS,
  responsivenessPayloads,
  responsivenessProjectRules,
} from './sentry-responsiveness-alerts-lib.mjs';
import { deriveEnterpriseRoutingFromD07Rules } from './sentry-enterprise-routing-lib.mjs';
import {
  assertSentryRequestUrl,
  diffMetricAlertRules,
  findMissingScopes,
} from './sentry-alerts-lib.mjs';

const mode = process.argv[2] ?? 'catalog';
if (!['catalog', 'check', 'apply'].includes(mode)) throw new Error('Use catalog, check or apply.');
const config = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  environment: process.env.SENTRY_ENVIRONMENT ?? 'staging',
};
if (config.environment !== 'staging') throw new Error('This rollout is staging-only.');
if (mode === 'catalog') {
  console.log(
    JSON.stringify(
      { mode, environment: config.environment, alerts: RESPONSIVENESS_ALERTS },
      null,
      2
    )
  );
} else {
  if (
    !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(config.org ?? '') ||
    !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(config.project ?? '') ||
    !process.env.SENTRY_AUTH_TOKEN
  )
    throw new Error('Approved SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT are required.');
  const request = async (path, options = {}) => {
    const url = assertSentryRequestUrl(new URL(path, 'https://sentry.io'));
    const response = await fetch(url, {
      ...options,
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok)
      throw new Error(`Sentry request failed (${response.status}); response content suppressed.`);
    return response.json();
  };
  const auth = await request('/api/0/');
  const missing = findMissingScopes(
    auth.auth?.scopes ?? [],
    mode === 'apply' ? ['alerts:read', 'alerts:write'] : ['alerts:read']
  );
  if (missing.length) throw new Error(`Sentry token missing scopes: ${missing.join(', ')}`);
  const path = `/api/0/organizations/${encodeURIComponent(config.org)}/alert-rules/`;
  const rules = await request(path);
  const scopedRules = responsivenessProjectRules(rules, config);
  const routing = deriveEnterpriseRoutingFromD07Rules(scopedRules);
  const payloads = responsivenessPayloads(config, routing);
  const remote = scopedRules.filter(rule => payloads.some(payload => payload.name === rule.name));
  if (mode === 'check') {
    const diff = diffMetricAlertRules({
      desired: RESPONSIVENESS_ALERTS,
      remote,
      project: config.project,
      environment: config.environment,
      actionsByLabel: routing.actionsByLabel,
      owner: routing.owner,
    });
    console.log(
      JSON.stringify({
        mode,
        environment: config.environment,
        missing: diff.missing.map(alert => alert.name),
        changed: diff.changed.map(item => item.desired.name),
        unchanged: diff.unchanged.map(alert => alert.name),
      })
    );
    if (diff.missing.length || diff.changed.length) process.exitCode = 1;
  } else {
    const results = [];
    for (const payload of payloads) {
      const existing = remote.find(rule => rule.name === payload.name);
      const result = await request(existing ? `${path}${encodeURIComponent(existing.id)}/` : path, {
        method: existing ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      results.push({
        name: payload.name,
        id: result.id,
        operation: existing ? 'updated' : 'created',
      });
    }
    console.log(JSON.stringify({ mode, environment: config.environment, results }));
  }
}
