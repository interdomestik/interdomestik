import assert from 'node:assert/strict';
import test from 'node:test';
import { sql } from 'drizzle-orm';
import {
  BRANCH_MEMBERSHIP_CHECKS,
  collectBranchMembershipViolations,
} from '../src/seed-assert-branch-membership';

type Rows = Array<{ id: unknown }>;

function fakeDb(rowsPerCall: Rows[]) {
  const queries: unknown[] = [];
  const db = {
    execute: async (query: unknown) => {
      queries.push(query);
      return rowsPerCall[queries.length - 1] ?? [];
    },
  };
  return { db: db as unknown as Parameters<typeof collectBranchMembershipViolations>[0], queries };
}

test('a clean dataset breaks no branch membership rule', async () => {
  const { db, queries } = fakeDb([]);

  assert.deepEqual(await collectBranchMembershipViolations(db), []);
  assert.equal(queries.length, BRANCH_MEMBERSHIP_CHECKS.length);
});

test('each broken rule is reported with a sample of row ids', async () => {
  const checks = [
    { label: 'first rule', query: sql`select 1` },
    { label: 'second rule', query: sql`select 2` },
    { label: 'third rule', query: sql`select 3` },
  ];
  const many = Array.from({ length: 7 }, (_, index) => ({ id: `row-${index}` }));
  const { db } = fakeDb([[{ id: 'agent-1' }], [], many]);

  assert.deepEqual(await collectBranchMembershipViolations(db, checks), [
    'first rule: agent-1',
    'third rule: row-0, row-1, row-2, row-3, row-4 and 2 more',
  ]);
});

test('the rules cover branch-required roles, grants and branch-scoped records', () => {
  const labels = BRANCH_MEMBERSHIP_CHECKS.map(check => check.label);

  assert.ok(labels.includes('agent or branch manager without a branch'));
  assert.ok(labels.includes('agent or branch manager role grant without a branch'));
  assert.ok(labels.includes('role grant outside the user branch'));
  assert.ok(labels.includes('user with role grants in more than one branch'));
  assert.ok(labels.includes('claim in a branch of another tenant'));
});
