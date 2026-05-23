import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const migrationPath = path.join(
  repoRoot,
  'packages/database/drizzle/0066_crm_task_priority_history_constraints.sql'
);
const schemaPath = path.join(repoRoot, 'packages/database/src/schema/crm.ts');

const eventValues = [
  'created',
  'assigned',
  'reassigned',
  'due_updated',
  'started',
  'completed',
  'cancelled',
  'reopened',
  'priority_updated',
];

const reasonValues = [
  'manual',
  'follow_up',
  'support_handoff',
  'assistance_review',
  'data_quality',
  'manual_assignment',
  'reassignment',
  'workload_balance',
  'due_date_changed',
  'due_date_cleared',
  'manual_start',
  'resolved',
  'no_longer_needed',
  'duplicate',
  'converted',
  'manually_closed',
  'not_needed',
  'created_in_error',
  'subject_closed',
  'follow_up_required',
  'incomplete',
  'manually_reopened',
  'manual_priority_change',
];

function parseQuotedValues(valueList) {
  return [...valueList.matchAll(/'([^']+)'/gu)].map(match => match[1]);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function extractConstraintValues(source, constraintName) {
  const match = source.match(
    new RegExp(`${escapeRegExp(constraintName)}[\\s\\S]{0,700}?in \\(([^)]*)\\)`, 'u')
  );
  assert.ok(match, `expected to find ${constraintName}`);
  return parseQuotedValues(match[1]);
}

function assertConstraintList(source, constraintName, values, invalidValue) {
  const actualValues = extractConstraintValues(source, constraintName);
  assert.deepEqual(actualValues, values);
  assert.equal(actualValues.includes(invalidValue), false);
}

test('CRM33 migration widens task history checks only to the authorized priority values', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');

  assert.match(migration, /DROP CONSTRAINT IF EXISTS "crm_task_history_event_check"/u);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS "crm_task_history_reason_code_check"/u);
  assertConstraintList(
    migration,
    'crm_task_history_event_check',
    eventValues,
    'invalid_priority_event'
  );
  assertConstraintList(
    migration,
    'crm_task_history_reason_code_check',
    reasonValues,
    'invalid_priority_reason'
  );
  assert.match(migration, /VALIDATE CONSTRAINT "crm_task_history_event_check"/u);
  assert.match(migration, /VALIDATE CONSTRAINT "crm_task_history_reason_code_check"/u);
});

test('CRM task schema mirrors the CRM33 migration allowlists', () => {
  const schema = fs.readFileSync(schemaPath, 'utf8');

  assertConstraintList(
    schema,
    'crm_task_history_event_check',
    eventValues,
    'invalid_priority_event'
  );
  assertConstraintList(
    schema,
    'crm_task_history_reason_code_check',
    reasonValues,
    'invalid_priority_reason'
  );
});
