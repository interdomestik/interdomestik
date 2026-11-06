import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const agentScope = vi.hoisted(() => vi.fn());
vi.mock('./agent-document-scope', () => ({ hasAgentClaimDocumentScope: agentScope }));

import { canShareAllDocuments, type ShareActor } from './share-eligible-documents';

const dialect = new PgDialect();

/** Answers each select with the next queued rows and records its where condition. */
function fakeTx(...results: unknown[][]) {
  const conditions: SQL[] = [];
  const select = vi.fn(() => ({
    from: () => ({
      where: (condition: SQL) => {
        conditions.push(condition);
        return Promise.resolve(results.shift() ?? []);
      },
    }),
  }));
  return { tx: { select } as never, conditions, select };
}

const doc = (id: string, entityType: string, entityId: string, uploadedBy = 'someone') => ({
  id,
  entityId,
  entityType,
  uploadedBy,
});
const claim = (overrides: Record<string, string | null> = {}) => ({
  agentId: null,
  branchId: 'branch-a',
  caseLifecycleState: 'submitted',
  ownerId: 'member-1',
  staffId: null,
  ...overrides,
});

async function share(actor: ShareActor, ids: string[], tx: never) {
  return canShareAllDocuments({ actor, documentIds: ids, tenantId: 'tenant-ks', tx });
}

describe('canShareAllDocuments', () => {
  beforeEach(() => agentScope.mockReset());

  it.each(['auditor', 'global_support', null, undefined])(
    'gives a %s no share capability without reading documents',
    async role => {
      const { tx, select } = fakeTx();
      await expect(share({ id: 'u-1', role }, ['doc-1'], tx)).resolves.toBe(false);
      expect(select).not.toHaveBeenCalled();
    }
  );

  it('loads only active requested documents of the tenant', async () => {
    const { tx, conditions } = fakeTx([doc('doc-1', 'member', 'member-1')]);

    await expect(share({ id: 'member-1', role: 'member' }, ['doc-1'], tx)).resolves.toBe(true);
    const query = dialect.sqlToQuery(conditions[0]);
    expect(query.sql).toMatch(/"tenant_id" = \$1.*"id" in \(\$2\).*"deleted_at" is null/);
    expect(query.params).toEqual(['tenant-ks', 'doc-1']);
  });

  it('refuses the whole request when any document is missing, deleted or foreign', async () => {
    const { tx } = fakeTx([doc('doc-1', 'member', 'member-1')]);
    await expect(share({ id: 'member-1', role: 'member' }, ['doc-1', 'doc-2'], tx)).resolves.toBe(
      false
    );
  });

  it.each([
    ['their own member document', doc('d', 'member', 'member-1'), true],
    ["another member's document", doc('d', 'member', 'member-2'), false],
    ['a document they uploaded', doc('d', 'other', 'x', 'member-1'), true],
    ['an unrelated document', doc('d', 'other', 'x'), false],
  ])('lets a member share %s: %s', async (_label, row, expected) => {
    const { tx } = fakeTx([row]);
    await expect(share({ id: 'member-1', role: 'member' }, ['d'], tx)).resolves.toBe(expected);
  });

  it('lets a full-tenant administrator share without claim reads', async () => {
    const { tx, select } = fakeTx([doc('d', 'claim', 'claim-1')]);
    await expect(share({ id: 'admin-1', role: 'tenant_admin' }, ['d'], tx)).resolves.toBe(true);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the claim owner', { id: 'member-1', role: 'member' }, claim(), true],
    ['another member', { id: 'member-2', role: 'member' }, claim(), false],
    ['the assigned staff', { id: 'staff-1', role: 'staff' }, claim({ staffId: 'staff-1' }), true],
    ['unassigned staff', { id: 'staff-2', role: 'staff' }, claim({ staffId: 'staff-1' }), false],
    [
      'the assigned staff of a member draft',
      { id: 'staff-1', role: 'staff' },
      claim({ staffId: 'staff-1', caseLifecycleState: 'draft' }),
      false,
    ],
    [
      'the owner of their own draft',
      { id: 'member-1', role: 'member' },
      claim({ caseLifecycleState: 'draft' }),
      true,
    ],
    [
      'the branch manager',
      { id: 'bm-1', role: 'branch_manager', branchId: 'branch-a' },
      claim(),
      true,
    ],
    [
      'another branch manager',
      { id: 'bm-2', role: 'branch_manager', branchId: 'branch-b' },
      claim(),
      false,
    ],
  ])('decides a claim document for %s', async (_label, actor, claimRow, expected) => {
    const { tx } = fakeTx([doc('d', 'claim', 'claim-1')], [claimRow]);
    await expect(share(actor as ShareActor, ['d'], tx)).resolves.toBe(expected);
    expect(agentScope).not.toHaveBeenCalled();
  });

  it.each([true, false])('defers an agent to its document scope (%s)', async allowed => {
    agentScope.mockResolvedValueOnce(allowed);
    const { tx } = fakeTx(
      [doc('d', 'claim', 'claim-1', 'agent-1')],
      [claim({ agentId: 'agent-1' })]
    );

    await expect(share({ id: 'agent-1', role: 'agent' }, ['d'], tx)).resolves.toBe(allowed);
    expect(agentScope).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 'agent-1', tenantId: 'tenant-ks' })
    );
  });

  it('holds an agent that owns the claim to its document scope', async () => {
    agentScope.mockResolvedValueOnce(false);
    const { tx } = fakeTx([doc('d', 'claim', 'claim-1')], [claim({ ownerId: 'agent-1' })]);

    await expect(share({ id: 'agent-1', role: 'agent' }, ['d'], tx)).resolves.toBe(false);
    expect(agentScope).toHaveBeenCalledTimes(1);
  });

  it('denies a claim document whose claim is not in the tenant', async () => {
    const { tx } = fakeTx([doc('d', 'claim', 'claim-1')], []);
    await expect(share({ id: 'member-1', role: 'member' }, ['d'], tx)).resolves.toBe(false);
  });

  it.each([
    ['owner', 'member-1', true],
    ['non-owner', 'member-2', false],
  ])('lets only the policy owner share a policy document (%s)', async (_label, id, expected) => {
    const { tx } = fakeTx([doc('d', 'policy', 'policy-1', id)], [{ ownerId: 'member-1' }]);
    await expect(share({ id, role: 'member' }, ['d'], tx)).resolves.toBe(expected);
  });
});
