import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  E2E_AGENT_LINK_LIFECYCLE_FIXTURES,
  E2E_AGENT_LINK_LIFECYCLE_INSTANTS,
  E2E_AGENT_LINK_LIFECYCLE_PAIR,
} from '../src/e2e-agent-link-lifecycle-fixtures';
import { E2E_AGENT_LINK_FIXTURES, E2E_USER_IDS } from '../src/e2e-role-fixtures';
import { E2E_USERS } from '../src/e2e-users';
import { collectAgentLinkLifecycleViolations } from '../src/seed-assert-agent-link-lifecycle';
import {
  buildAgentLinkLifecycleHistoryToSeed,
  buildAgentLinkLifecycleRow,
} from '../src/seed-golden/agent-link-lifecycle';
import { buildAgentAssignmentsToSeed } from '../src/seed-golden/agent-assignments';
import { seedAgentAssignments } from '../src/seed-golden/agent-assignments';
import { buildUsersToSeed } from '../src/seed-golden/users';
import * as schema from '../src/schema';
import { goldenId } from '../src/seed-utils/seed-ids';
import { sql } from 'drizzle-orm';

test('the reactivation pair has its own catalogued member', () => {
  assert.ok('KS_MEMBER_LINK_LIFECYCLE' in E2E_USERS, 'the lifecycle member must be catalogued');
  const users = buildUsersToSeed({ at: () => new Date('2026-01-01T00:00:00.000Z') });
  const pack = readFileSync(
    new URL('../src/seed-packs/ks-workflow-pack.ts', import.meta.url),
    'utf8'
  );
  const names = /const ALBANIAN_NAMES = \[([\s\S]*?)\];/.exec(pack)?.[1];
  assert.ok(names, 'the KS pack member list must be counted');
  // Plus KS pack staff and the agent pack's one agent and two clients.
  const packIdentities = [...names.matchAll(/'[^']+'/g)].length + 4;
  assert.ok(users.length + packIdentities <= 100, 'golden users plus both packs fit the dataset');
  assert.equal(new Set(users.map(user => user.id)).size, users.length);
  const pair = E2E_AGENT_LINK_LIFECYCLE_PAIR;
  const agent = users.find(user => user.id === pair.agentId);
  const member = users.find(user => user.id === pair.memberId);
  assert.ok(agent && member);
  assert.equal(agent.tenantId, pair.tenantId);
  assert.equal(member.tenantId, pair.tenantId);
  assert.equal('branchId' in agent && agent.branchId, 'ks_branch_d');
  assert.equal('branchId' in member && member.branchId, 'ks_branch_d');
  assert.equal(member.role, 'member');
  assert.notEqual(member.id, E2E_USER_IDS.KS_MEMBER_CONVERTED_LEAD);
});

test('active, inactive and other-agent links already exist and are preserved', () => {
  const assignments = buildAgentAssignmentsToSeed();
  for (const fixture of Object.values(E2E_AGENT_LINK_FIXTURES)) {
    const row = assignments.find(link => link.id === fixture.id);
    assert.ok(row, fixture.id);
    assert.deepEqual(
      [goldenId(row.agent), goldenId(row.member), row.tenant, row.status],
      [fixture.agentId, fixture.memberId, fixture.tenantId, fixture.status]
    );
  }
  assert.ok(assignments.every(row => row.id !== E2E_AGENT_LINK_LIFECYCLE_PAIR.id));
});

test('one pair has ordered active, inactive and reactivated fixture checkpoints', () => {
  const fixtures = E2E_AGENT_LINK_LIFECYCLE_FIXTURES;
  assert.deepEqual(Object.keys(fixtures), ['ACTIVE', 'INACTIVE', 'REACTIVATED']);
  const keys = Object.keys(fixtures) as (keyof typeof fixtures)[];
  const snapshots = keys.map(key => buildAgentLinkLifecycleRow(key));
  for (const row of snapshots) {
    assert.equal(row.createdAt.toISOString(), E2E_AGENT_LINK_LIFECYCLE_INSTANTS.ACTIVE);
    assert.equal(row.joinedAt.toISOString(), E2E_AGENT_LINK_LIFECYCLE_INSTANTS.ACTIVE);
  }
  assert.equal(new Set(snapshots.map(row => row.id)).size, 1, 'reuse the unique pair');
  assert.deepEqual(
    snapshots.map(row => row.status),
    ['active', 'inactive', 'active']
  );
  const history = buildAgentLinkLifecycleHistoryToSeed();
  assert.deepEqual(
    history.map(row => row.metadata.previousStatus),
    [null, 'active', 'inactive']
  );
  assert.deepEqual(
    history.map(row => row.metadata.status),
    ['active', 'inactive', 'active']
  );
  assert.equal(new Set(history.map(row => row.id)).size, 3);
  assert.deepEqual(history, buildAgentLinkLifecycleHistoryToSeed());
  assert.deepEqual(buildAgentLinkLifecycleRow(), snapshots[2]);
  assert.deepEqual(
    history.map(row => row.createdAt.toISOString()),
    Object.values(E2E_AGENT_LINK_LIFECYCLE_INSTANTS)
  );
  for (const [index, row] of history.entries()) {
    assert.equal(row.entityId, snapshots[index].id);
    assert.equal(row.metadata.agentId, snapshots[index].agentId);
    assert.equal(row.metadata.memberId, snapshots[index].memberId);
    assert.equal(
      row.action,
      'seed.agent_link_lifecycle',
      'synthetic history is explicitly labelled'
    );
    assert.equal(row.metadata.fixtureKey, keys[index]);
    assert.ok(row.createdAt >= snapshots[index].createdAt);
    if (index > 0) assert.ok(row.createdAt > history[index - 1].createdAt);
  }
});

type Row = Record<string, unknown>;

function cleanRows(): Row[][] {
  return [[buildAgentLinkLifecycleRow()], buildAgentLinkLifecycleHistoryToSeed()];
}

async function violations(rows = cleanRows()): Promise<string[]> {
  let call = 0;
  const db = {
    select: () => ({ from: () => ({ where: async () => rows[call++] }) }),
  } as unknown as Parameters<typeof collectAgentLinkLifecycleViolations>[0];
  return collectAgentLinkLifecycleViolations(db, schema);
}

test('strict lifecycle assertion refuses each missing or drifted current/history field', async () => {
  assert.deepEqual(await violations(), []);
  for (const [index, group] of cleanRows().entries()) {
    for (const [rowIndex, row] of group.entries()) {
      const missing = cleanRows();
      missing[index].splice(rowIndex, 1);
      assert.ok((await violations(missing)).length > 0, `${String(row.id)} missing`);
      for (const field of Object.keys(row).filter(field => field !== 'metadata')) {
        const wrong = cleanRows();
        wrong[index][rowIndex] = { ...row, [field]: 'drifted' };
        assert.ok((await violations(wrong)).length > 0, `${String(row.id)}.${field}`);
      }
      for (const field of Object.keys((row.metadata ?? {}) as Row)) {
        const wrong = cleanRows();
        wrong[index][rowIndex].metadata = { ...(row.metadata as Row), [field]: 'drifted' };
        assert.ok((await violations(wrong)).length > 0, `${String(row.id)}.metadata.${field}`);
      }
    }
  }
});

test('an extra grant, substituted pair or extra history checkpoint fails strictly', async () => {
  for (const index of [0, 1]) {
    const rows = cleanRows();
    rows[index].push({ ...rows[index][0], id: 'unexpected' });
    assert.ok((await violations(rows)).some(message => message.includes('unexpected')));
  }
  const rows = cleanRows();
  rows[0][0] = { ...rows[0][0], memberId: E2E_USER_IDS.KS_MEMBER_CONVERTED_LEAD };
  assert.ok((await violations(rows)).some(message => message.includes('.memberId')));
});

test('the normal assignment step upserts the final pair and every history field on repeated runs', async t => {
  const writes: { rows: Row[]; update: Row }[] = [];
  const db = {
    insert: () => ({
      values: (rows: Row | Row[]) => ({
        onConflictDoUpdate: async ({ set }: { set: Row }) => {
          writes.push({ rows: Array.isArray(rows) ? rows : [rows], update: set });
        },
      }),
    }),
  } as unknown as Parameters<typeof seedAgentAssignments>[0]['db'];
  t.mock.method(console, 'log', () => {});
  const context = { db, schema, sql, at: () => new Date(0) };
  await seedAgentAssignments(context);
  await seedAgentAssignments(context);
  for (const expected of [
    buildAgentLinkLifecycleRow(),
    ...buildAgentLinkLifecycleHistoryToSeed(),
  ]) {
    const matching = writes.filter(write => write.rows.some(row => row.id === expected.id));
    assert.equal(matching.length, 2, `${expected.id} seeded once on each run`);
    for (const write of matching) {
      assert.deepEqual(
        write.rows.find(row => row.id === expected.id),
        expected
      );
      assert.deepEqual(
        Object.keys(write.update).sort(),
        Object.keys(expected)
          .filter(key => key !== 'id')
          .sort()
      );
    }
  }
});
