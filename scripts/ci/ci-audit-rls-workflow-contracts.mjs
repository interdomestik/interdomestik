import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

const root = path.resolve(import.meta.dirname, '../..');
const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'));
const findStep = (steps, name) => steps.find(step => step?.name === name);

test('CI audit preserves full E2E, tenant guard, and architecture guards', () => {
  const auditRun = findStep(workflow.jobs.audit.steps, 'Run Audits').run;
  assert.match(auditRun, /pnpm check:e2e-contracts\b/u);
  assert.doesNotMatch(auditRun, /check:e2e-contracts:base/u);
  assert.match(auditRun, /pnpm check:tenant-guard\b/u);
  assert.doesNotMatch(auditRun, /pnpm check:db-access\b/u);
  assert.match(auditRun, /pnpm check:architecture-boundaries/u);
});

test('CI RLS integration requires both integration and coverage guards', () => {
  const rls = findStep(workflow.jobs['e2e-gate'].steps, 'RLS Integration Test');
  assert.equal(rls.env.REQUIRE_RLS_INTEGRATION, '1');
  assert.equal(rls.env.REQUIRE_RLS_COVERAGE, '1');
  assert.equal(rls.run, 'pnpm db:rls:test');
  assert.equal(
    workflow.jobs['e2e-gate'].env.DATABASE_URL,
    'postgresql://postgres:postgres@127.0.0.1:5432/interdomestik_test'
  );
  const rootScripts = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts;
  const domainScripts = JSON.parse(
    fs.readFileSync(path.join(root, 'packages/domain-communications/package.json'), 'utf8')
  ).scripts;
  assert.equal(
    rootScripts['db:rls:test'],
    'pnpm --filter @interdomestik/database test:rls && pnpm --filter @interdomestik/domain-communications test:rls && pnpm db:rls:test:staff-detail'
  );
  assert.equal(rootScripts['db:rls:test:staff-detail'], 'node scripts/run-staff-detail-rls.mjs');
  // Each message suite grants its own role on shared catalog rows, so files run one at a time.
  assert.equal(
    domainScripts['test:rls'],
    'MESSAGE_RLS_INTEGRATION=1 REQUIRE_RLS_INTEGRATION=1 vitest run --no-file-parallelism src/messages/tenant-context.integration.test.ts src/messages/send-negative-matrix.integration.test.ts src/messages/send-idempotency.integration.test.ts src/messages/public-reply-notification.integration.test.ts'
  );
});
