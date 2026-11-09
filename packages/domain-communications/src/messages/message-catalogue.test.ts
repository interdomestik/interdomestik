import { describe, expect, it } from 'vitest';

import { E2E_DISCOVERY_THREADS } from '../../../database/src/e2e-communication-fixtures';
import { E2E_CASE_FIXTURES } from '../../../database/src/e2e-role-fixtures';
import { E2E_USERS } from '../../../database/src/e2e-users';
import { messageCatalogueCopy } from './message-catalogue.test-support';

describe('message mutation catalogue copy', () => {
  it('copies the named anchor, participants and thread without exposing base row IDs to writes', () => {
    const before = structuredClone(E2E_DISCOVERY_THREADS.KS_ANCHOR);
    const rows = messageCatalogueCopy('run-a', 'worker-1');
    expect(rows).toEqual(messageCatalogueCopy('run-a', 'worker-1'));
    expect(rows.claim).toMatchObject({
      id: rows.ids.claim,
      tenantId: rows.homeTenantId,
      userId: rows.ids.member,
      staffId: rows.ids.staff,
      branchId: rows.ids.agentBranch,
    });
    expect(rows.claim.id).not.toBe(E2E_CASE_FIXTURES.KS_ANCHOR.id);
    expect(rows.users.map(user => user.role)).toEqual(['member', 'member', 'staff', 'agent']);
    expect(rows.users.find(user => user.id === rows.ids.staff)?.name).toBe(E2E_USERS.KS_STAFF.name);
    expect(rows.link).toMatchObject({ agentId: rows.ids.agent, memberId: rows.ids.member });
    expect(
      rows.messages.map(row => [row.claimId, row.senderId, row.content, row.isInternal])
    ).toEqual([
      [rows.ids.claim, rows.ids.staff, before.STAFF_REPLY.row.content, false],
      [rows.ids.claim, rows.ids.staff, before.INTERNAL_NOTE.row.content, true],
    ]);
    expect(rows.messages.every(row => row.id.startsWith('p070_mut_'))).toBe(true);
    rows.messages[0].createdAt.setUTCFullYear(2030);
    expect(E2E_DISCOVERY_THREADS.KS_ANCHOR).toEqual(before);
  });

  it('does not share any mutable row or tenant between workers', () => {
    const first = messageCatalogueCopy('run-a', 'worker-1');
    const second = messageCatalogueCopy('run-a', 'worker-2');
    const firstIds = new Set(Object.values(first.ids));
    expect(Object.values(second.ids).some(id => firstIds.has(id))).toBe(false);
    expect(first.homeTenantId).not.toBe(second.homeTenantId);
    expect(first.users.map(user => user.email)).not.toEqual(second.users.map(user => user.email));
  });
});
