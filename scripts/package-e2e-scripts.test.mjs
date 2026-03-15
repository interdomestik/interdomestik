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
    'node scripts/run-with-default-db-url.mjs pnpm e2e:state:setup && node scripts/run-with-default-db-url.mjs pnpm e2e:gate:pr:fast'
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
  const pilotCheck = packageJson.scripts['pilot:check'];
  const pilotDecisionRecord = packageJson.scripts['pilot:decision:record'];
  const pilotEvidenceRecord = packageJson.scripts['pilot:evidence:record'];
  const pilotTagReady = packageJson.scripts['pilot:tag:ready'];
  const releaseGateProd = packageJson.scripts['release:gate:prod'];
  const releaseGateProdRaw = packageJson.scripts['release:gate:prod:raw'];
  const pilotVerifyScript = readFileSync(new URL('../scripts/pilot-verify.sh', import.meta.url), 'utf8');
  const pilotRunbook = readFileSync(new URL('../docs/pilot/PILOT_RUNBOOK.md', import.meta.url), 'utf8');
  const pilotGoNoGo = readFileSync(new URL('../docs/pilot/PILOT_GO_NO_GO.md', import.meta.url), 'utf8');

  assert.equal(pilotCheck, 'node scripts/run-with-dotenv.mjs bash scripts/pilot-verify.sh');
  assert.equal(
    releaseGateProd,
    'node scripts/run-with-dotenv.mjs pnpm -s release:gate:prod:raw'
  );
  assert.equal(releaseGateProdRaw, 'tsx scripts/release-gate/run.ts --envName production --suite all');
  assert.equal(pilotDecisionRecord, 'tsx scripts/pilot-decision-proof.ts');
  assert.equal(pilotEvidenceRecord, 'tsx scripts/pilot-daily-evidence.ts');
  assert.equal(pilotTagReady, 'node scripts/pilot-ready-tag.js');
  assert.notEqual(pilotCheck, releaseGateProd);

  assert.match(
    pilotVerifyScript,
    /This command is local pre-launch verification only; it does not create release reports or pilot-entry artifacts\./
  );
  assert.match(pilotVerifyScript, /For production release proof use: pnpm release:gate:prod/);
  assert.match(
    pilotVerifyScript,
    /For pilot entry artifact generation use: pnpm release:gate:prod -- --pilotId <pilot-id>/
  );

  assert.match(pilotRunbook, /## Readiness Command Authority/);
  assert.match(pilotRunbook, /`pnpm pilot:check`/);
  assert.match(pilotRunbook, /`pnpm release:gate:prod -- --pilotId <pilot-id>`/);
  assert.match(pilotRunbook, /`pnpm pilot:evidence:record -- --pilotId <pilot-id>`/);
  assert.match(pilotRunbook, /`pnpm pilot:decision:record -- --pilotId <pilot-id>`/);
  assert.match(pilotRunbook, /`pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>`/);
  assert.match(
    pilotRunbook,
    /`\.\/scripts\/pilot-verify\.sh`\s+-\s+Shell-native implementation of `pnpm pilot:check`\./s
  );

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
    /Daily and weekly continue\/pause\/hotfix\/stop decisions are recorded in that same copied evidence index via `pnpm pilot:decision:record -- --pilotId <pilot-id>`\./
  );
  assert.match(
    pilotGoNoGo,
    /Rollback target and resume rules use a real `pilot-ready-YYYYMMDD` tag created or verified through `pnpm pilot:tag:ready -- --pilotId <pilot-id> --date <YYYY-MM-DD>`\./
  );
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
