#!/usr/bin/env node

import {
  ENTERPRISE_SENTRY_ALERTS,
  validateEnterpriseAlertCatalog,
} from './sentry-enterprise-alerts-lib.mjs';
import { applyEnterpriseAlerts, checkEnterpriseAlerts } from './sentry-enterprise-provider-lib.mjs';

const [, , command = 'catalog', ...restArgs] = process.argv;
const flags = new Set(restArgs);
const jsonOutput = flags.has('--json');
const reuseD07Routing = flags.has('--reuse-d07-routing');

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
  case 'apply':
    await runApply();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    console.error(
      'Usage: node scripts/sentry-enterprise-alerts.mjs <catalog|check|apply> ' +
        '[--json] [--reuse-d07-routing]'
    );
    process.exit(1);
}

async function runCheck() {
  const payload = await checkEnterpriseAlerts(config);
  writeOutput(payload, jsonOutput);
  if (payload.mode === 'remote-check' && (payload.missing.length > 0 || payload.changed.length > 0))
    process.exitCode = 1;
}

async function runApply() {
  writeOutput(await applyEnterpriseAlerts(config, { reuseD07Routing }), jsonOutput);
}

function writeOutput(payload, asJson) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  if (payload.mode === 'remote-check') {
    console.log('Enterprise Sentry alert check for configured project and environment');
    console.log(`- missing: ${payload.missing.length}`);
    console.log(`- changed: ${payload.changed.length}`);
    console.log(`- unchanged: ${payload.unchanged.length}`);
    return;
  }
  if (payload.mode === 'apply') {
    console.log('Applied enterprise Sentry alerts for configured project and environment');
    console.log(`- routing owner set: ${payload.routing.ownerSet ? 'yes' : 'no'}`);
    console.log(`- reused D07 rules: ${payload.routing.reusedD07RuleIds.length}`);
    for (const result of payload.results) {
      console.log(`- ${result.operation}: ${result.name} (${result.remoteId})`);
    }
    return;
  }
  if (payload.note) console.log(payload.note);
  for (const alert of payload.alerts) console.log(`- ${alert.name} :: ${alert.query}`);
}
