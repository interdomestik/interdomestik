import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';

const root = path.resolve(import.meta.dirname, '../..');
const workflow = yaml.load(fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'));
const findStep = (steps, name) => steps.find(step => step?.name === name);

test('CI audit preserves full E2E, DB access, and architecture guards', () => {
  const auditRun = findStep(workflow.jobs.audit.steps, 'Run Audits').run;
  assert.match(auditRun, /pnpm check:e2e-contracts\b/u);
  assert.doesNotMatch(auditRun, /check:e2e-contracts:base/u);
  assert.match(auditRun, /pnpm check:db-access/u);
  assert.match(auditRun, /pnpm check:architecture-boundaries/u);
});

test('CI RLS integration requires both integration and coverage guards', () => {
  const rls = findStep(workflow.jobs['e2e-gate'].steps, 'RLS Integration Test');
  assert.equal(rls.env.REQUIRE_RLS_INTEGRATION, '1');
  assert.equal(rls.env.REQUIRE_RLS_COVERAGE, '1');
});
