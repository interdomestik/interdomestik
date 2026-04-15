import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import packageJson from '../package.json' with { type: 'json' };
import databasePackageJson from '../packages/database/package.json' with { type: 'json' };
import billingPackageJson from '../packages/domain-membership-billing/package.json' with { type: 'json' };
import webPackageJson from '../apps/web/package.json' with { type: 'json' };

test('e2e gate scripts keep full and fast lanes distinct', () => {
  const stateSetup = packageJson.scripts['e2e:state:setup'];
  const fullGate = packageJson.scripts['e2e:gate'];
  const fastGate = packageJson.scripts['e2e:gate:fast'];
  const prGate = packageJson.scripts['e2e:gate:pr'];
  const prGateFast = packageJson.scripts['e2e:gate:pr:fast'];
  const fastCheck = packageJson.scripts['check:fast'];

  assert.equal(typeof stateSetup, 'string');
  assert.match(stateSetup, /setup\.state\.spec\.ts/);
  assert.match(stateSetup, /--project=setup-ks/);
  assert.match(stateSetup, /--project=setup-mk/);

  assert.match(fullGate, /pnpm e2e:state:setup/);
  assert.match(fullGate, /PW_FAST_GATES=1/);
  assert.match(fullGate, /--project=gate-ks-sq/);
  assert.match(fullGate, /--project=gate-mk-mk/);
  assert.doesNotMatch(fullGate, /--project=gate-mk-contract/);

  assert.match(fastGate, /PW_FAST_GATES=1/);
  assert.match(fastGate, /--project=gate-ks-sq/);
  assert.match(fastGate, /--project=gate-mk-mk/);
  assert.doesNotMatch(fastGate, /--project=gate-mk-contract/);

  assert.equal(typeof prGate, 'string');
  assert.match(prGate, /pnpm e2e:state:setup/);
  assert.match(prGate, /--project=gate-ks-sq/);
  assert.match(prGate, /--project=gate-mk-contract/);
  assert.doesNotMatch(prGate, /--project=gate-mk-mk/);

  assert.equal(typeof prGateFast, 'string');
  assert.match(prGateFast, /PW_FAST_GATES=1/);
  assert.match(prGateFast, /--project=gate-ks-sq/);
  assert.match(prGateFast, /--project=gate-mk-contract/);
  assert.doesNotMatch(prGateFast, /--project=gate-mk-mk/);

  assert.equal(
    fastCheck,
    'node scripts/run-with-default-db-url.mjs bash -lc \'cd "$PWD" && NEXT_PUBLIC_BILLING_TEST_MODE=1 pnpm --filter @interdomestik/web run build:ci\' && node scripts/run-with-default-db-url.mjs pnpm e2e:state:setup && node scripts/run-with-default-db-url.mjs pnpm e2e:gate:pr:fast'
  );
  assert.notEqual(fullGate, fastGate);
  assert.notEqual(prGate, prGateFast);
});

test('web package exposes full and PR gate lanes separately', () => {
  const fullGate = webPackageJson.scripts['e2e:gate'];
  const fastGate = webPackageJson.scripts['e2e:gate:fast'];
  const prGate = webPackageJson.scripts['e2e:gate:pr'];
  const prGateFast = webPackageJson.scripts['e2e:gate:pr:fast'];

  assert.match(fullGate, /--project=gate-ks-sq/);
  assert.match(fullGate, /--project=gate-mk-mk/);
  assert.doesNotMatch(fullGate, /--project=gate-mk-contract/);

  assert.match(fastGate, /--project=gate-ks-sq/);
  assert.match(fastGate, /--project=gate-mk-mk/);
  assert.doesNotMatch(fastGate, /--project=gate-mk-contract/);

  assert.match(prGate, /--project=gate-ks-sq/);
  assert.match(prGate, /--project=gate-mk-contract/);
  assert.doesNotMatch(prGate, /--project=gate-mk-mk/);

  assert.match(prGateFast, /--project=gate-ks-sq/);
  assert.match(prGateFast, /--project=gate-mk-contract/);
  assert.doesNotMatch(prGateFast, /--project=gate-mk-mk/);
});

test('root package exposes the scripts/ci contract suite', () => {
  assert.equal(packageJson.scripts['test:ci:contracts'], 'node --test scripts/ci/*.test.mjs');
});

test('pilot readiness commands keep local verification and production proof distinct', () => {
  const pilotCadenceCheck = packageJson.scripts['pilot:cadence:check'];
  const pilotCheck = packageJson.scripts['pilot:check'];
  const pilotDecisionRecord = packageJson.scripts['pilot:decision:record'];
  const pilotEvidenceRecord = packageJson.scripts['pilot:evidence:record'];
  const pilotFlow = packageJson.scripts['pilot:flow'];
  const pilotObservabilityRecord = packageJson.scripts['pilot:observability:record'];
  const pilotTagReady = packageJson.scripts['pilot:tag:ready'];
  const releaseGateProd = packageJson.scripts['release:gate:prod'];
  const releaseGateProdRaw = packageJson.scripts['release:gate:prod:raw'];
  const commands5 = readFileSync(new URL('../docs/pilot/COMMANDS_5.md', import.meta.url), 'utf8');
  const pilotVerifyScript = readFileSync(new URL('../scripts/pilot-verify.sh', import.meta.url), 'utf8');
  const pilotEntryCriteria = readFileSync(
    new URL('../docs/pilot-entry-criteria.md', import.meta.url),
    'utf8'
  );
  const pilotRunbook = readFileSync(new URL('../docs/pilot/PILOT_RUNBOOK.md', import.meta.url), 'utf8');
  const pilotGoNoGo = readFileSync(new URL('../docs/pilot/PILOT_GO_NO_GO.md', import.meta.url), 'utf8');
  const pilotEvidenceTemplate = readFileSync(
    new URL('../docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md', import.meta.url),
    'utf8'
  );

  assert.equal(pilotCadenceCheck, 'tsx scripts/pilot-readiness-cadence.ts');
  assert.equal(pilotCheck, 'node scripts/run-with-dotenv.mjs bash scripts/pilot-verify.sh');
  assert.equal(
    pilotFlow,
    'node scripts/run-with-dotenv.mjs bash scripts/pilot-verify.sh --print-ranked-flow'
  );
  assert.equal(
    releaseGateProd,
    'node scripts/run-with-dotenv.mjs pnpm -s release:gate:prod:raw'
  );
  assert.equal(releaseGateProdRaw, 'tsx scripts/release-gate/run.ts --envName production --suite all');
  assert.equal(pilotDecisionRecord, 'tsx scripts/pilot-decision-proof.ts');
  assert.equal(pilotEvidenceRecord, 'tsx scripts/pilot-daily-evidence.ts');
  assert.equal(pilotObservabilityRecord, 'tsx scripts/pilot-observability-evidence.ts');
  assert.equal(pilotTagReady, 'tsx scripts/pilot-ready-tag.js');
  assert.notEqual(pilotCadenceCheck, pilotCheck);
  assert.notEqual(pilotCheck, releaseGateProd);

  assert.match(pilotVerifyScript, /Canonical ranked pilot-entry flow/);
  assert.match(pilotVerifyScript, /For the ranked operator path use: pnpm pilot:flow/);
  assert.match(
    pilotVerifyScript,
    /pnpm pilot:evidence:record -- --pilotId <pilot-id> --day <n> --date <YYYY-MM-DD> --owner "<owner>" --status <green\|amber\|red> --incidentCount <n> --highestSeverity <none\|sev3\|sev2\|sev1> --decision <continue\|pause\|hotfix\|stop> --bundlePath <path\|n\/a>/
  );
  assert.match(
    pilotVerifyScript,
    /pnpm pilot:observability:record -- --pilotId <pilot-id> --reference <day-<n>\|week-<n>> --date <YYYY-MM-DD> --owner "<owner>" --logSweepResult <clear\|expected-noise\|action-required> --functionalErrorCount <n> --expectedAuthDenyCount <n> --kpiCondition <within-threshold\|watch\|breach> --incidentCount <n> --highestSeverity <none\|sev3\|sev2\|sev1> --notes <text\|n\/a>/
  );
  assert.match(
    pilotVerifyScript,
    /pnpm pilot:decision:record -- --pilotId <pilot-id> --reviewType <daily\|weekly> --reference <day-<n>\|week-<n>> --date <YYYY-MM-DD> --owner "<owner>" --decision <continue\|pause\|hotfix\|stop> \[--rollbackTag <pilot-ready-YYYYMMDD\|n\/a>\] \[--observabilityRef <day-<n>\|week-<n>>\]/
  );
  assert.match(
    pilotVerifyScript,
    /This command is local pre-launch verification only; it does not create release reports or pilot-entry artifacts\./
  );
  assert.match(pilotVerifyScript, /For production release proof use: pnpm release:gate:prod/);
  assert.match(
    pilotVerifyScript,
    /For pilot entry artifact generation use: pnpm release:gate:prod -- --pilotId <pilot-id>/
  );

  assert.match(
    pilotRunbook,
    /The repo now has one canonical ranked operator flow for pilot entry and daily pilot operation\./
  );
  assert.match(
    pilotRunbook,
    /Start with `pnpm pilot:flow` or `docs\/pilot\/COMMANDS_5\.md`\./
  );
  assert.match(pilotRunbook, /## Readiness Command Authority/);
  assert.match(pilotRunbook, /`pnpm pilot:check`/);
  assert.match(pilotRunbook, /`pnpm release:gate:prod -- --pilotId <pilot-id>`/);
  assert.match(pilotRunbook, /`pnpm pilot:evidence:record -- --pilotId <pilot-id>`/);
  assert.match(
    pilotRunbook,
    /`pnpm pilot:observability:record -- --pilotId <pilot-id>`/
  );
  assert.match(pilotRunbook, /`pnpm pilot:decision:record -- --pilotId <pilot-id>`/);
  assert.match(pilotRunbook, /`pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>`/);
  assert.match(pilotRunbook, /`pnpm pilot:cadence:check -- --pilotId <pilot-id>`/);
  assert.match(
    pilotRunbook,
    /Readiness cadence is satisfied only after 3 consecutive qualifying green operating days for the pilot id\./
  );
  assert.match(
    pilotRunbook,
    /Historical `A22` streak notes remain background only and must not be used as live pilot governance proof\./
  );
  assert.match(
    pilotRunbook,
    /`\.\/scripts\/pilot-verify\.sh`\s+-\s+Shell-native implementation of `pnpm pilot:check`\./s
  );
  assert.match(commands5, /## Ranked Pilot-Entry Flow/);
  assert.match(commands5, /Use `pnpm pilot:flow` to print this ranked operator path from the repo\./);
  assert.match(commands5, /## 1\. Pre-Launch Readiness/);
  assert.match(commands5, /## 2\. Production Gate Proof And Pilot-Entry Artifacts/);
  assert.match(commands5, /## 3\. Launch-Day And Daily Operating Row/);
  assert.match(commands5, /## 4\. Launch-Day And Daily Observability Row/);
  assert.match(commands5, /## 5\. Launch-Day And Daily Decision Row/);
  assert.match(commands5, /## Conditional Commands/);
  assert.match(commands5, /pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>/);
  assert.match(commands5, /pnpm pilot:cadence:check -- --pilotId <pilot-id>/);

  assert.match(pilotGoNoGo, /Local pre-launch readiness is green: `pnpm pilot:check` exits `0`\./);
  assert.match(
    pilotGoNoGo,
    /Release gate green on production: `pnpm release:gate:prod -- --pilotId <pilot-id>` exits `0`\./
  );
  assert.match(
    pilotGoNoGo,
    /Daily pilot evidence is recorded in the copied `docs\/pilot\/PILOT_EVIDENCE_INDEX_<pilot-id>\.md` file via `pnpm pilot:evidence:record -- --pilotId <pilot-id>`\./
  );
  assert.match(
    pilotGoNoGo,
    /Observability evidence is recorded in that same copied evidence index via `pnpm pilot:observability:record -- --pilotId <pilot-id>`\./
  );
  assert.match(
    pilotGoNoGo,
    /Daily and weekly continue\/pause\/hotfix\/stop decisions are recorded in that same copied evidence index via `pnpm pilot:decision:record -- --pilotId <pilot-id>`\./
  );
  assert.match(
    pilotGoNoGo,
    /Rollback target and resume rules use a real `pilot-ready-YYYYMMDD` tag created or verified through `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>`\./
  );
  assert.match(
    pilotGoNoGo,
    /Readiness cadence proof is green when the active pilot id already has 3 consecutive qualifying green operating days recorded and `pnpm pilot:cadence:check -- --pilotId <pilot-id>` exits `0`\./
  );
  assert.match(
    pilotEntryCriteria,
    /Observability evidence records log-sweep result, KPI condition, incident count, and highest severity in that same copied evidence index via `pnpm pilot:observability:record -- --pilotId <pilot-id>`\./
  );
  assert.match(
    pilotEntryCriteria,
    /Run `pnpm pilot:cadence:check -- --pilotId <pilot-id>` only after the active pilot id already has 3 consecutive qualifying green days recorded and you need to prove readiness cadence for continuation or expansion\./
  );
  assert.match(
    pilotEvidenceTemplate,
    /A qualifying readiness-cadence day requires `green`, `0` incidents, `none` highest severity, `continue`, and a valid `docs\/release-gates\/\.\.\.` report path\./
  );
  assert.match(pilotEvidenceTemplate, /## Observability Evidence Log/);
  assert.match(pilotEvidenceTemplate, /Observability Ref/);
});

test('root package exposes the D07 Sentry alert management scripts', () => {
  assert.equal(packageJson.scripts['sentry:alerts:check'], 'node scripts/sentry-alerts.mjs check');
  assert.equal(packageJson.scripts['sentry:alerts:apply'], 'node scripts/sentry-alerts.mjs apply');
});

test('database package keeps a dedicated critical-table RLS verification in the canonical RLS suite', () => {
  const rlsSuite = databasePackageJson.scripts['test:rls'];

  assert.equal(typeof rlsSuite, 'string');
  assert.match(rlsSuite, /test\/critical-rls-tables\.test\.ts/);
});

test('billing surfaces no longer expose Stripe configuration contracts', () => {
  const apiKeysScript = readFileSync(new URL('../scripts/api-keys.sh', import.meta.url), 'utf8');
  const startTaskScript = readFileSync(new URL('../scripts/start-10x-task.sh', import.meta.url), 'utf8');
  const securitySetupScript = readFileSync(
    new URL('../scripts/security-setup.sh', import.meta.url),
    'utf8'
  );
  const environmentDoc = readFileSync(new URL('../ENVIRONMENT.md', import.meta.url), 'utf8');

  assert.equal(Object.hasOwn(billingPackageJson.exports, './stripe'), false);
  assert.doesNotMatch(
    apiKeysScript,
    /\["stripe"\]|check_stripe_usage|STRIPE_SECRET_KEY|NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/
  );
  assert.doesNotMatch(startTaskScript, /webhooks\/stripe|STRIPE_\* variables|\*"stripe"\*/);
  assert.doesNotMatch(
    securitySetupScript,
    /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/
  );
  assert.doesNotMatch(
    environmentDoc,
    /NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/
  );
});

test('api key monitoring script keeps placeholder skips and paddle/github paths defined', () => {
  const apiKeysScript = readFileSync(new URL('../scripts/api-keys.sh', import.meta.url), 'utf8');

  assert.match(apiKeysScript, /is_placeholder_api_key\(\)/);
  assert.match(apiKeysScript, /re_YOUR_RESEND_KEY/);
  assert.match(apiKeysScript, /YOUR_GITHUB_CLIENT_SECRET/);
  assert.match(apiKeysScript, /set-locally/);
  assert.match(apiKeysScript, /check_paddle_usage\(\)/);
  assert.match(apiKeysScript, /check_github_usage\(\)/);
});
