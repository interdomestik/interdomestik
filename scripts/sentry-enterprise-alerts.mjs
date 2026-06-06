#!/usr/bin/env node

import {
  ENTERPRISE_SENTRY_ALERTS,
  diffEnterpriseMetricAlertRules,
  validateEnterpriseAlertCatalog,
} from './sentry-enterprise-alerts-lib.mjs';
import {
  findMissingScopes,
  resolveActionsByLabel,
} from './sentry-alerts-lib.mjs';

const [, , command = 'catalog', ...restArgs] = process.argv;
const flags = new Set(restArgs);
const jsonOutput = flags.has('--json');
const SENTRY_API_ORIGIN = 'https://sentry.io';
const SENTRY_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

const problems = validateEnterpriseAlertCatalog(ENTERPRISE_SENTRY_ALERTS);
if (problems.length > 0) {
  console.error('Invalid enterprise Sentry alert catalog:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

const config = {
  authToken: process.env.SENTRY_AUTH_TOKEN ?? '',
  org: process.env.SENTRY_ORG ?? '',
  project: process.env.SENTRY_PROJECT ?? '',
  environment: process.env.SENTRY_ENVIRONMENT ?? 'production',
  owner: process.env.SENTRY_ENTERPRISE_ALERT_OWNER ?? '',
};

switch (command) {
  case 'catalog':
    writeOutput({ mode: 'catalog-only', alerts: ENTERPRISE_SENTRY_ALERTS }, jsonOutput);
    break;
  case 'check':
    await runCheck();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error('Usage: node scripts/sentry-enterprise-alerts.mjs <catalog|check> [--json]');
    process.exit(1);
}

async function runCheck() {
  if (!config.authToken || !config.org || !config.project) {
    writeOutput(
      {
        mode: 'catalog-only',
        alerts: ENTERPRISE_SENTRY_ALERTS,
        note: 'Remote comparison skipped because Sentry configuration is incomplete.',
      },
      jsonOutput
    );
    return;
  }

  const orgSlug = requireSentrySlug(config.org, 'SENTRY_ORG');
  const authInfo = await fetchSentryAuthInfo({
    headers: { Authorization: `Bearer ${config.authToken}` },
  });
  ensureScopes(authInfo, ['alerts:read']);

  const remoteRules = await fetchEnterpriseAlertRules(orgSlug, {
    headers: { Authorization: `Bearer ${config.authToken}` },
  });
  const remoteEntRules = remoteRules.filter(rule => rule.name.startsWith('[ENT] '));
  const diff = diffEnterpriseMetricAlertRules({
    remote: remoteEntRules,
    project: config.project,
    environment: config.environment,
    actionsByLabel: resolveActionsByLabel(),
    owner: config.owner || null,
    compareActions: false,
    compareOwner: Boolean(config.owner),
  });

  writeOutput(
    {
      mode: 'remote-check',
      project: config.project,
      environment: config.environment,
      missing: diff.missing.map(alert => alert.name),
      changed: diff.changed.map(item => item.desired.name),
      unchanged: diff.unchanged.map(alert => alert.name),
      remoteEnterpriseRules: remoteEntRules.map(rule => ({ id: rule.id, name: rule.name })),
    },
    jsonOutput
  );

  if (diff.missing.length > 0 || diff.changed.length > 0) process.exitCode = 1;
}

function requireSentrySlug(value, label) {
  if (!SENTRY_SLUG_PATTERN.test(value)) {
    throw new Error(`${label} must be a Sentry slug, not a URL or path.`);
  }
  return value;
}

async function fetchSentryAuthInfo(init) {
  const response = await fetch(`${SENTRY_API_ORIGIN}/api/0/`, init);
  return parseSentryResponse(response);
}

async function fetchEnterpriseAlertRules(orgSlug, init) {
  const path = `/api/0/organizations/${encodeURIComponent(orgSlug)}/alert-rules/`;
  const response = await fetch(`${SENTRY_API_ORIGIN}${path}`, init);
  return parseSentryResponse(response);
}

async function parseSentryResponse(response) {
  const bodyText = await response.text();
  if (!response.ok) throw new Error(`Sentry API request failed (${response.status}): ${bodyText}`);
  return bodyText ? JSON.parse(bodyText) : null;
}

function ensureScopes(authInfo, requiredScopes) {
  const missing = findMissingScopes(authInfo?.auth?.scopes ?? [], requiredScopes);
  if (missing.length > 0)
    throw new Error(`Sentry auth token is missing scopes: ${missing.join(', ')}`);
}

function writeOutput(payload, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  if (payload.mode === 'remote-check') {
    console.log(
      `Enterprise Sentry alert check for project=${payload.project} environment=${payload.environment}`
    );
    console.log(`- missing: ${payload.missing.length}`);
    console.log(`- changed: ${payload.changed.length}`);
    console.log(`- unchanged: ${payload.unchanged.length}`);
    return;
  }
  if (payload.note) console.log(payload.note);
  for (const alert of payload.alerts) console.log(`- ${alert.name} :: ${alert.query}`);
}
