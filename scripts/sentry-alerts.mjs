#!/usr/bin/env node

import {
  buildMetricAlertPayload,
  diffMetricAlertRules,
  D07_SENTRY_ALERTS,
  findMissingScopes,
  resolveActionsByLabel,
  validateAlertCatalog,
} from './sentry-alerts-lib.mjs';

const [, , command = 'check', ...restArgs] = process.argv;
const flags = new Set(restArgs);
const jsonOutput = flags.has('--json');

const validationProblems = validateAlertCatalog(D07_SENTRY_ALERTS);
if (validationProblems.length > 0) {
  console.error('Invalid D07 Sentry alert catalog:');
  for (const problem of validationProblems) {
    console.error(`- ${problem}`);
  }
  process.exit(1);
}

const config = {
  baseUrl: (process.env.SENTRY_API_BASE_URL ?? 'https://sentry.io').replace(/\/+$/, ''),
  authToken: process.env.SENTRY_AUTH_TOKEN ?? '',
  org: process.env.SENTRY_ORG ?? '',
  project: process.env.SENTRY_PROJECT ?? '',
  environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
  owner: process.env.SENTRY_ALERT_OWNER ?? '',
};

switch (command) {
  case 'check':
    await runCheck({ jsonOutput, config });
    break;
  case 'apply':
    await runApply({ jsonOutput, config });
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error('Usage: node scripts/sentry-alerts.mjs <check|apply> [--json]');
    process.exit(1);
}

async function runCheck({ jsonOutput, config }) {
  if (!config.authToken || !config.org || !config.project) {
    const payload = {
      mode: 'catalog-only',
      alerts: D07_SENTRY_ALERTS,
      note: 'Remote comparison skipped because SENTRY_AUTH_TOKEN, SENTRY_ORG, or SENTRY_PROJECT is unset.',
    };

    writeOutput(payload, jsonOutput);
    return;
  }

  const authInfo = await getAuthInfo(config);
  ensureScopes(authInfo, ['alerts:read']);
  const actionsByLabel = resolveActionsByLabel();
  const compareActions =
    Boolean(process.env.SENTRY_ALERT_ACTIONS_JSON) ||
    Boolean(process.env.SENTRY_ALERT_ACTIONS_WARNING_JSON) ||
    Boolean(process.env.SENTRY_ALERT_ACTIONS_CRITICAL_JSON);
  const remoteRules = await listMetricAlertRules(config);
  const d07Rules = remoteRules.filter(rule => rule.name.startsWith('[D07] '));
  const diff = diffMetricAlertRules({
    desired: D07_SENTRY_ALERTS,
    remote: d07Rules,
    project: config.project,
    environment: config.environment,
    actionsByLabel,
    owner: config.owner || null,
    compareActions,
    compareOwner: Boolean(config.owner),
  });

  const payload = {
    mode: 'remote-check',
    project: config.project,
    environment: config.environment,
    missing: diff.missing.map(alert => alert.name),
    changed: diff.changed.map(item => item.desired.name),
    unchanged: diff.unchanged.map(alert => alert.name),
    remoteD07Rules: d07Rules.map(rule => ({ id: rule.id, name: rule.name })),
  };

  writeOutput(payload, jsonOutput);

  if (diff.missing.length > 0 || diff.changed.length > 0) {
    process.exitCode = 1;
  }
}

async function runApply({ jsonOutput, config }) {
  requireRemoteConfig(config);
  const authInfo = await getAuthInfo(config);
  ensureScopes(authInfo, ['alerts:read', 'alerts:write']);

  const actionsByLabel = resolveActionsByLabel();
  if ((actionsByLabel.critical?.length ?? 0) === 0 && (actionsByLabel.warning?.length ?? 0) === 0) {
    throw new Error(
      'Applying D07 alerts requires action targets. Set SENTRY_ALERT_ACTIONS_JSON or the label-specific *_JSON variants.'
    );
  }

  const remoteRules = await listMetricAlertRules(config);
  const remoteByName = new Map(remoteRules.map(rule => [rule.name, rule]));
  const results = [];

  for (const alert of D07_SENTRY_ALERTS) {
    const payload = buildMetricAlertPayload(alert, {
      project: config.project,
      environment: config.environment,
      actionsByLabel,
      owner: config.owner || null,
    });
    const existing = remoteByName.get(payload.name);

    if (existing) {
      const updated = await putMetricAlertRule(config, existing.id, payload);
      results.push({ id: alert.id, operation: 'updated', remoteId: updated.id, name: updated.name });
      continue;
    }

    const created = await postMetricAlertRule(config, payload);
    results.push({ id: alert.id, operation: 'created', remoteId: created.id, name: created.name });
  }

  writeOutput(
    {
      mode: 'apply',
      results,
    },
    jsonOutput
  );
}

function requireRemoteConfig(config) {
  const missing = ['authToken', 'org', 'project'].filter(key => !config[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required Sentry configuration: ${missing.join(', ')}`);
  }
}

async function listMetricAlertRules(config) {
  const url = new URL(`/api/0/organizations/${config.org}/alert-rules/`, config.baseUrl);
  return sentryFetchJson(url, {
    headers: {
      Authorization: `Bearer ${config.authToken}`,
    },
  });
}

async function postMetricAlertRule(config, payload) {
  const url = new URL(`/api/0/organizations/${config.org}/alert-rules/`, config.baseUrl);
  return sentryFetchJson(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function putMetricAlertRule(config, ruleId, payload) {
  const url = new URL(`/api/0/organizations/${config.org}/alert-rules/${ruleId}/`, config.baseUrl);
  return sentryFetchJson(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${config.authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function sentryFetchJson(url, init) {
  const response = await fetch(url, init);
  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(`Sentry API request failed (${response.status}): ${bodyText}`);
  }

  return bodyText ? JSON.parse(bodyText) : null;
}

async function getAuthInfo(config) {
  const url = new URL('/api/0/', config.baseUrl);
  return sentryFetchJson(url, {
    headers: {
      Authorization: `Bearer ${config.authToken}`,
    },
  });
}

function ensureScopes(authInfo, requiredScopes) {
  const missingScopes = findMissingScopes(authInfo?.auth?.scopes ?? [], requiredScopes);
  if (missingScopes.length > 0) {
    throw new Error(
      `Sentry auth token is missing required scopes: ${missingScopes.join(', ')}`
    );
  }
}

function writeOutput(payload, jsonOutput) {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if (payload.mode === 'catalog-only') {
    console.log(payload.note);
    for (const alert of payload.alerts) {
      console.log(`- ${alert.name} :: ${alert.aggregate} :: ${alert.query}`);
    }
    return;
  }

  if (payload.mode === 'remote-check') {
    console.log(`Sentry D07 alert check for project=${payload.project} environment=${payload.environment}`);
    console.log(`- missing: ${payload.missing.length}`);
    console.log(`- changed: ${payload.changed.length}`);
    console.log(`- unchanged: ${payload.unchanged.length}`);
    return;
  }

  if (payload.mode === 'apply') {
    console.log('Applied D07 Sentry alerts:');
    for (const result of payload.results) {
      console.log(`- ${result.operation}: ${result.name} (${result.remoteId})`);
    }
  }
}
