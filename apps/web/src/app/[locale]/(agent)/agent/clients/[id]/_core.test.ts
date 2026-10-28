import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  withTenantContext: vi.fn(),
  claimSummary: vi.fn(),
  ambientSelect: vi.fn(),
  ambientFindFirst: vi.fn(),
  getAgentMemberDetail: vi.fn(),
}));

vi.mock('@interdomestik/database', async () => {
  const schema = await vi.importActual<Record<string, unknown>>('@interdomestik/database/schema');
  return { ...schema, withTenantContext: hoisted.withTenantContext };
});
vi.mock('@interdomestik/database/db', () => {
  const ambient = {
    select: hoisted.ambientSelect,
    query: { user: { findFirst: hoisted.ambientFindFirst } },
  };
  return { db: ambient, dbAdmin: ambient };
});
vi.mock('@interdomestik/domain-agent', () => ({
  getAgentMemberDetail: hoisted.getAgentMemberDetail,
}));
vi.mock('./_claim-summary', () => ({ getAgentClientClaimSummary: hoisted.claimSummary }));

import { getAgentClientProfileCore } from './_core';

const dialect = new PgDialect();
const params = (where: unknown) => dialect.sqlToQuery(where as SQL).params;

const VIEWER = { id: 'agent-1', role: 'agent', tenantId: 'tenant_ks' };
const MEMBER = { id: 'm1', name: 'Member One', email: 'm1@example.test', agent: null };
const SUMMARY = {
  claimCounts: { total: 3, open: 1, resolved: 1, rejected: 1 },
  recentClaims: [{ id: 'c1', status: 'submitted' }],
};

type TxOptions = {
  assignment?: unknown[] | Error;
  member?: unknown;
  subscription?: unknown;
  preferences?: unknown;
  activities?: unknown;
  summary?: unknown;
};

const settle = (value: unknown) =>
  value instanceof Error ? Promise.reject(value) : Promise.resolve(value);

function createTx(opts: TxOptions = {}) {
  const log: string[] = [];
  const captured: { where?: unknown; limit?: number } = {};
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn((where: unknown) => {
      captured.where = where;
      return chain;
    }),
    limit: vi.fn((limit: number) => {
      captured.limit = limit;
      log.push('assignment');
      return settle(opts.assignment ?? [{ id: 'assignment-1' }]);
    }),
  };
  const track = (name: string, value: unknown) =>
    vi.fn((_options: unknown) => {
      log.push(name);
      return settle(value);
    });
  const query = {
    user: { findFirst: track('member', 'member' in opts ? opts.member : MEMBER) },
    subscriptions: {
      findFirst: track('subscription', 'subscription' in opts ? opts.subscription : null),
    },
    userNotificationPreferences: {
      findFirst: track('preferences', 'preferences' in opts ? opts.preferences : null),
    },
    memberActivities: { findMany: track('activities', opts.activities ?? []) },
  };
  const tx = { select: vi.fn(() => chain), query };
  hoisted.withTenantContext.mockImplementation(
    async (_ctx: unknown, action: (t: unknown) => Promise<unknown>) => action(tx)
  );
  hoisted.claimSummary.mockImplementation(() => {
    log.push('claims');
    return settle(opts.summary ?? SUMMARY);
  });
  return { tx, query, log, captured };
}

function expectNoAmbientOrLegacyReads() {
  expect(hoisted.ambientSelect).not.toHaveBeenCalled();
  expect(hoisted.ambientFindFirst).not.toHaveBeenCalled();
  expect(hoisted.getAgentMemberDetail).not.toHaveBeenCalled();
}

describe('getAgentClientProfileCore', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each(['staff', 'member', 'admin', 'tenant_admin', 'super_admin', 'unknown', null, undefined])(
    'denies exercised role %s before any transaction or read',
    async role => {
      const res = await getAgentClientProfileCore({ memberId: 'm1', viewer: { ...VIEWER, role } });
      expect(res).toEqual({ kind: 'forbidden' });
      expect(hoisted.withTenantContext).not.toHaveBeenCalled();
      expect(hoisted.claimSummary).not.toHaveBeenCalled();
      expectNoAmbientOrLegacyReads();
    }
  );

  it.each([null, undefined, '', '   '])(
    'denies missing tenant %p before any read',
    async tenantId => {
      const res = await getAgentClientProfileCore({
        memberId: 'm1',
        viewer: { ...VIEWER, tenantId },
      });
      expect(res).toEqual({ kind: 'forbidden' });
      expect(hoisted.withTenantContext).not.toHaveBeenCalled();
      expectNoAmbientOrLegacyReads();
    }
  );

  it('admits through active canonical ownership in one tenant transaction and preserves the DTO', async () => {
    const subscription = { status: 'active', planId: 'standard' };
    const preferences = { emailClaimUpdates: true };
    const activities = [{ id: 'a1', agent: { id: 'agent-1', name: 'A', email: 'a@x.test' } }];
    const { tx, query, log, captured } = createTx({ subscription, preferences, activities });

    const res = await getAgentClientProfileCore({ memberId: 'm1', viewer: VIEWER });

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext.mock.calls[0][0]).toEqual({
      tenantId: 'tenant_ks',
      role: 'agent',
    });
    expect(params(captured.where)).toEqual(['tenant_ks', 'agent-1', 'm1', 'active']);
    expect(captured.limit).toBe(1);
    expect(log.slice(0, 2)).toEqual(['assignment', 'member']);
    expect([...log.slice(2)].sort()).toEqual([
      'activities',
      'claims',
      'preferences',
      'subscription',
    ]);

    const memberConfig = query.user.findFirst.mock.calls[0][0] as { where: unknown; with: unknown };
    expect(params(memberConfig.where)).toEqual(['m1', 'tenant_ks']);
    expect(memberConfig.with).toEqual({
      agent: { columns: { id: true, name: true, email: true, image: true } },
    });
    const subConfig = query.subscriptions.findFirst.mock.calls[0][0] as { where: unknown };
    expect(params(subConfig.where)).toEqual(['m1', 'tenant_ks']);
    const prefConfig = query.userNotificationPreferences.findFirst.mock.calls[0][0] as {
      where: unknown;
    };
    expect(params(prefConfig.where)).toEqual(['m1', 'tenant_ks']);
    const actConfig = query.memberActivities.findMany.mock.calls[0][0] as {
      where: unknown;
      with: unknown;
    };
    expect(params(actConfig.where)).toEqual(['m1', 'tenant_ks']);
    expect(actConfig.with).toEqual({ agent: { columns: { id: true, name: true, email: true } } });
    expect(hoisted.claimSummary).toHaveBeenCalledWith(tx, 'm1', 'tenant_ks');

    expect(res).toEqual({
      kind: 'ok',
      member: MEMBER,
      membership: {
        status: 'active',
        badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        subscription,
      },
      preferences,
      claimCounts: SUMMARY.claimCounts,
      recentClaims: SUMMARY.recentClaims,
      activities,
    });
    expectNoAmbientOrLegacyReads();
  });

  it('returns forbidden without member or child reads when no active assignment exists', async () => {
    const { query, log } = createTx({ assignment: [] });
    const res = await getAgentClientProfileCore({ memberId: 'm-foreign', viewer: VIEWER });

    expect(res).toEqual({ kind: 'forbidden' });
    expect(log).toEqual(['assignment']);
    expect(query.user.findFirst).not.toHaveBeenCalled();
    expect(query.subscriptions.findFirst).not.toHaveBeenCalled();
    expect(query.userNotificationPreferences.findFirst).not.toHaveBeenCalled();
    expect(query.memberActivities.findMany).not.toHaveBeenCalled();
    expect(hoisted.claimSummary).not.toHaveBeenCalled();
    expectNoAmbientOrLegacyReads();
  });

  it('does not admit a legacy agentId without an active agent_clients relationship', async () => {
    const { query, log } = createTx({
      assignment: [],
      member: { ...MEMBER, agentId: VIEWER.id },
    });

    const res = await getAgentClientProfileCore({ memberId: MEMBER.id, viewer: VIEWER });

    expect(res).toEqual({ kind: 'forbidden' });
    expect(log).toEqual(['assignment']);
    expect(query.user.findFirst).not.toHaveBeenCalled();
    expectNoAmbientOrLegacyReads();
  });

  it('returns not_found without child reads when the admitted member row is missing', async () => {
    const { query, log } = createTx({ member: undefined });
    const res = await getAgentClientProfileCore({ memberId: 'm1', viewer: VIEWER });

    expect(res).toEqual({ kind: 'not_found' });
    expect(log).toEqual(['assignment', 'member']);
    expect(query.subscriptions.findFirst).not.toHaveBeenCalled();
    expect(hoisted.claimSummary).not.toHaveBeenCalled();
  });

  it('keeps legitimately empty children valid', async () => {
    createTx({
      subscription: undefined,
      preferences: undefined,
      activities: [],
      summary: { claimCounts: { total: 0, open: 0, resolved: 0, rejected: 0 }, recentClaims: [] },
    });
    const res = await getAgentClientProfileCore({ memberId: 'm1', viewer: VIEWER });

    if (res.kind !== 'ok') throw new Error('Expected ok result');
    expect(res.membership).toEqual({
      status: 'none',
      badgeClass: 'bg-muted text-muted-foreground border-transparent',
      subscription: null,
    });
    expect(res.preferences).toBeNull();
    expect(res.activities).toEqual([]);
    expect(res.recentClaims).toEqual([]);
    expect(res.claimCounts).toEqual({ total: 0, open: 0, resolved: 0, rejected: 0 });
  });

  it('falls back membership status to none for unknown status', async () => {
    createTx({ subscription: { status: 'weird_status' } });
    const res = await getAgentClientProfileCore({ memberId: 'm1', viewer: VIEWER });

    if (res.kind !== 'ok') throw new Error('Expected ok result');
    expect(res.membership.status).toBe('none');
  });

  it('propagates assignment query failures instead of fabricating a result', async () => {
    const failure = new Error('assignment failed');
    const { query } = createTx({ assignment: failure });
    await expect(getAgentClientProfileCore({ memberId: 'm1', viewer: VIEWER })).rejects.toBe(
      failure
    );
    expect(query.user.findFirst).not.toHaveBeenCalled();
  });

  it('propagates member and child query failures', async () => {
    const memberFailure = new Error('member failed');
    createTx({ member: memberFailure });
    await expect(getAgentClientProfileCore({ memberId: 'm1', viewer: VIEWER })).rejects.toBe(
      memberFailure
    );

    const childFailure = new Error('activities failed');
    createTx({ activities: childFailure });
    await expect(getAgentClientProfileCore({ memberId: 'm1', viewer: VIEWER })).rejects.toBe(
      childFailure
    );
  });

  it('propagates tenant-context transaction failures', async () => {
    const failure = new Error('rls connection not ready');
    hoisted.withTenantContext.mockRejectedValue(failure);
    await expect(getAgentClientProfileCore({ memberId: 'm1', viewer: VIEWER })).rejects.toBe(
      failure
    );
    expectNoAmbientOrLegacyReads();
  });
});
