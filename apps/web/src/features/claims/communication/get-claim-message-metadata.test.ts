import { beforeEach, describe, expect, it } from 'vitest';
import { authority, message, resetQueryModel, state } from './communication-query.test-support';
import { getClaimMessageMetadata } from './get-claim-message-metadata';

const read = (claimId = 'own') => getClaimMessageMetadata({ claimId, authority });
beforeEach(resetQueryModel);
describe('branch-manager message metadata projection', () => {
  it('returns the exact DTO keys without fetching content or sender text', async () => {
    state.rows.claim_messages = [
      message('public', 'member', false, '2026-11-01T10:00:00Z'),
      message('internal', 'staff', true, '2026-11-02T10:00:00Z'),
      message('legacy', 'staff', null, null),
      { ...message('foreign', 'member', false, '2026-11-03T10:00:00Z'), tenant_id: 'tenant-b' },
      {
        ...message('other-claim', 'staff', false, '2026-11-03T10:00:00Z'),
        claim_id: 'other-branch',
      },
    ];
    const result = await read();
    expect(result).toEqual({
      kind: 'ok',
      data: {
        count: 3,
        lastMessageAt: '2026-11-02T10:00:00.000Z',
        awaitingReply: true,
      },
    });
    if (result.kind !== 'ok') throw new Error('Expected metadata');
    expect(Object.keys(result.data).sort()).toEqual(['awaitingReply', 'count', 'lastMessageAt']);
    expect(JSON.stringify(result)).not.toContain('SENTINEL');
    expect(state.selections).toEqual([
      ['memberId'],
      ['count', 'lastMessageAt'],
      ['senderId', 'senderRole', 'createdAt'],
    ]);
    expect(state.queries[0].params).toEqual(['own', 'tenant-a', 'branch-a']);
    expect(state.queries[1].params).toEqual(['tenant-a', 'own']);
    expect(state.queries[2].params).toEqual(['tenant-a', 'own', false]);
    expect(state.orderings[0]).toContain('desc nulls last');
    expect(state.joins[0]).toEqual({
      sql: '("user"."id" = "claim_messages"."sender_id" and "user"."tenant_id" = $1)',
      params: ['tenant-a'],
    });
  });
  it('distinguishes an empty authorized claim from unavailable', async () => {
    expect(await read()).toEqual({
      kind: 'ok',
      data: {
        count: 0,
        lastMessageAt: null,
        awaitingReply: false,
      },
    });
  });
  it.each([
    ['member -> agent', ['member', 'agent'], true],
    ['member -> staff', ['member', 'staff'], false],
    ['staff -> member', ['staff', 'member'], true],
    ['member -> staff -> agent', ['member', 'staff', 'agent'], false],
    ['member -> agent -> member', ['member', 'agent', 'member'], true],
  ] as const)('%s preserves the staff-reply rule', async (_label, senders, awaitingReply) => {
    state.rows.claim_messages = senders.map((sender, index) =>
      message(String(index), sender, false, `2026-11-0${index + 1}T10:00:00Z`)
    );
    expect(await read()).toMatchObject({ data: { awaitingReply } });
  });
  it('an internal-only staff reply after a member does not clear awaitingReply', async () => {
    state.rows.claim_messages = [
      message('m', 'member', false, '2026-11-01T10:00:00Z'),
      message('s', 'staff', true, '2026-11-02T10:00:00Z'),
    ];
    expect(await read()).toMatchObject({ data: { awaitingReply: true } });
  });
  it.each([
    ['staff', false],
    ['admin', false],
    ['tenant_admin', false],
    ['super_admin', false],
    ['agent', true],
    ['branch_manager', true],
    ['global_support', true],
    ['auditor', true],
    ['unknown', true],
  ] as const)(
    'classifies %s with the existing staff reply helpers',
    async (role, awaitingReply) => {
      state.rows.user.push({ id: 'reply-sender', tenant_id: 'tenant-a', role });
      state.rows.claim_messages = [
        message('m', 'member', false, '2026-11-01T10:00:00Z'),
        message('s', 'reply-sender', false, '2026-11-02T10:00:00Z'),
      ];
      expect(await read()).toMatchObject({ data: { awaitingReply } });
    }
  );
  it('does not treat a missing or foreign-tenant sender role as a staff reply', async () => {
    state.rows.claim_messages = [
      message('m', 'member', false, '2026-11-01T10:00:00Z'),
      message('s', 'missing-sender', false, '2026-11-02T10:00:00Z'),
    ];
    state.rows.user.push({ id: 'missing-sender', tenant_id: 'tenant-b', role: 'staff' });
    expect(await read()).toMatchObject({ data: { awaitingReply: true } });
    state.rows.user = [];
    expect(await read()).toMatchObject({ data: { awaitingReply: true } });
  });
  it('orders equal timestamps deterministically by id and preserves null timestamp availability', async () => {
    state.rows.claim_messages = [
      message('a', 'member', false, null),
      message('z', 'staff', false, null),
    ];
    expect(await read()).toMatchObject({
      data: { count: 2, lastMessageAt: null, awaitingReply: false },
    });
  });
  it('breaks dated public-message ties by id', async () => {
    state.rows.claim_messages = [
      message('a', 'staff', false, '2026-11-01T10:00:00Z'),
      message('z', 'member', false, '2026-11-01T10:00:00Z'),
    ];
    expect(await read()).toMatchObject({ data: { awaitingReply: true } });
  });
  it('a null legacy date cannot outrank a dated public reply', async () => {
    state.rows.claim_messages = [
      message('z', 'member', false, null),
      message('a', 'staff', false, '2026-11-01T10:00:00Z'),
    ];
    expect(await read()).toMatchObject({ data: { awaitingReply: false } });
  });
  it.each(['other-branch', 'foreign', 'missing'])('denies %s independently', async id => {
    expect(await read(id)).toEqual({ kind: 'unavailable' });
    expect(state.selections).toEqual([['memberId']]);
  });
  it.each(['staff', 'tenant_admin', 'admin', 'super_admin', 'branch_manager,admin'])(
    'refuses metadata for non-BM authority %s without querying',
    async role => {
      state.descriptor.principal.role = role;
      expect(await read()).toEqual({ kind: 'unavailable' });
      expect(state.selections).toEqual([]);
    }
  );
  it.each(['missing-branch', 'foreign-access-tenant', 'wrong-purpose'])(
    'fails closed for %s',
    async mode => {
      if (mode === 'missing-branch') state.descriptor.principal.branchId = '';
      if (mode === 'foreign-access-tenant') state.descriptor.accessTenantId = 'tenant-b';
      if (mode === 'wrong-purpose') state.descriptor.purpose = 'scheduled-work';
      expect(await read()).toEqual({ kind: 'unavailable' });
      expect(state.selections).toEqual([]);
    }
  );
  it('reports query failure without its private diagnostic', async () => {
    state.fail = true;
    expect(await read()).toEqual({ kind: 'failed' });
  });
});
