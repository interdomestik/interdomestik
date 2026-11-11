import { beforeEach, describe, expect, it } from 'vitest';
import { mintTenantAuthority } from '@interdomestik/database/tenant-authority';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { resetMetadataModel, state } from './metadata-query.test-support';
import { getHandoffMetadata } from './get-handoff-metadata';

const authority = (
  role = 'branch_manager',
  branchId: string | null = 'branch-a',
  accessTenantId = 'tenant-a'
) =>
  mintTenantAuthority({
    tenantId: 'tenant-a',
    purpose: 'session',
    accessTenantId,
    principal: { userId: 'bm', role, branchId, agentId: null },
  });
const read = (handoffId?: string) => getHandoffMetadata({ authority: authority(), handoffId });
beforeEach(resetMetadataModel);

describe('BM support handoff metadata boundary', () => {
  it('returns only allowlisted keys with no text sentinels and tenant-scoped metadata joins', async () => {
    const result = await read();
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('Expected metadata');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'own',
      status: 'accepted',
      publicResponseCount: 2,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-02T00:00:00.000Z',
      memberReplyAt: null,
      staffName: 'Assignee',
      branchName: 'Branch',
    });
    expect(Object.keys(result.data[0]).sort((a, b) => a.localeCompare(b))).toEqual(
      [
        'id',
        'status',
        'urgency',
        'staffId',
        'staffName',
        'branchId',
        'branchName',
        'createdAt',
        'updatedAt',
        'acceptedAt',
        'reassignedAt',
        'closedAt',
        'publicResponseAt',
        'publicResponseCount',
        'memberReplyAt',
      ].sort((a, b) => a.localeCompare(b))
    );
    expect(JSON.stringify(result)).not.toContain('SENTINEL');
    expect(state.selections[0]).toEqual(Object.keys(result.data[0]));
    expect(state.queries[0].params).toEqual(['tenant-a', 'branch-a']);
    expect(state.joins.every(join => join.params.includes('tenant-a'))).toBe(true);
  });
  it('excludes both other branch and foreign tenant detail IDs', async () => {
    for (const id of ['other-branch', 'other-tenant', 'missing'])
      expect(await read(id)).toEqual({ kind: 'ok', data: [] });
  });
  it('does not match content-only or subject-only searches', async () => {
    for (const search of [
      'CONTENT-ONLY-SENTINEL',
      'SUBJECT-SENTINEL',
      'PUBLIC-SENTINEL',
      'REPLY-SENTINEL',
    ]) {
      expect(await getHandoffMetadata({ authority: authority(), filters: { search } })).toEqual({
        kind: 'ok',
        data: [],
      });
    }
    for (const query of state.queries) {
      expect(query.sql).not.toMatch(/subject|message|public_response"|member_reply"|reason/);
      expect(query.sql).toContain('ilike');
    }
    expect(
      await getHandoffMetadata({ authority: authority(), filters: { search: 'Assignee' } })
    ).toMatchObject({ data: [{ id: 'own' }] });
  });
  it('honors metadata filters and treats wildcard characters literally', async () => {
    for (const filters of [
      { status: 'closed' as const },
      { assignment: 'unassigned' as const },
      { search: '%' },
      { attention: 'needs_follow_up' as const },
    ]) {
      expect(await getHandoffMetadata({ authority: authority(), filters })).toEqual({
        kind: 'ok',
        data: [],
      });
    }
    expect(state.queries[2].params).toContain('%\\%%');
  });
  it.each([
    'tenant_admin',
    'admin',
    'super_admin',
    'staff',
    'member',
    'agent',
    'global_support',
    'auditor',
    'branch_manager_other',
    'branch_manager,admin',
  ])('refuses %s before a metadata transaction', async role => {
    expect(await getHandoffMetadata({ authority: authority(role) })).toEqual({
      kind: 'unavailable',
    });
    expect(state.selections).toEqual([]);
  });
  it('fails closed for absent branch, mismatched authority tenants, forged tokens and service purpose', async () => {
    for (const token of [
      authority('branch_manager', null),
      authority('branch_manager', 'branch-a', 'tenant-b'),
      mintTenantAuthority({ tenantId: 'tenant-a', purpose: 'test' }),
      {} as TenantAuthority,
    ]) {
      expect((await getHandoffMetadata({ authority: token })).kind).toMatch(/unavailable|failed/);
    }
    expect(state.selections).toEqual([]);
  });
  it('distinguishes empty, unavailable and failed results without exposing errors', async () => {
    state.rows.support_handoffs = [];
    expect(await read()).toEqual({ kind: 'ok', data: [] });
    state.fail = true;
    expect(await read()).toEqual({ kind: 'failed' });
  });
});
