import { getTableName, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  principal: { userId: 'admin-1', role: 'tenant_admin' } as { userId: string; role: string } | null,
  results: [] as Record<string, unknown>[][],
  queries: [] as { table: string; sql: string; params: unknown[]; limit?: number }[],
  fail: false,
  authorityCalls: 0,
  captureException: vi.fn(),
}));

const authority = {} as TenantAuthority;
vi.mock('server-only', () => ({}));
vi.mock('@sentry/nextjs', () => ({ captureException: state.captureException }));
vi.mock('@interdomestik/database/tenant-authority', () => ({
  readTenantAuthority: () => ({ tenantId: 'tenant-a', principal: state.principal }),
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: (_authority: unknown, run: (tx: unknown) => Promise<unknown>) => {
    state.authorityCalls += 1;
    if (state.fail) return Promise.reject(new Error('PRIVATE-DB-SENTINEL'));
    return run(transaction());
  },
}));

type Builder = Promise<unknown> & {
  from(table: Parameters<typeof getTableName>[0]): Builder;
  where(predicate: SQL): Builder;
  orderBy(): Builder;
  limit(value: number): Builder;
};

// Records each query after its synchronous chain is configured, then returns the queued rows.
function transaction() {
  return {
    select: () => {
      const query: (typeof state.queries)[number] = { table: '', sql: '', params: [] };
      const rows = Promise.resolve().then(() => {
        state.queries.push(query);
        return state.results.shift() ?? [];
      });
      const builder: Builder = Object.assign(rows, {
        from(table: Parameters<typeof getTableName>[0]) {
          query.table = getTableName(table);
          return builder;
        },
        where(predicate: SQL) {
          const compiled = new PgDialect().sqlToQuery(predicate);
          query.sql = compiled.sql;
          query.params = compiled.params;
          return builder;
        },
        orderBy: () => builder,
        limit(value: number) {
          query.limit = value;
          return builder;
        },
      });
      return builder;
    },
  };
}

import {
  ASSIGNMENT_HISTORY_LIMIT,
  getClaimAssignmentHistory,
} from './get-claim-assignment-history';

const at = new Date('2026-11-13T10:00:00Z');
const read = () => getClaimAssignmentHistory({ claimId: 'claim-1', authority });

beforeEach(() => {
  state.principal = { userId: 'admin-1', role: 'tenant_admin' };
  state.results = [];
  state.queries = [];
  state.fail = false;
  state.authorityCalls = 0;
  state.captureException.mockReset();
});

describe('getClaimAssignmentHistory', () => {
  it('reads only this claim’s assignment audit rows and names inside the authority tenant', async () => {
    state.results = [
      [
        {
          id: 'a1',
          action: 'assign_owner',
          createdAt: at,
          actorId: 'admin-1',
          actorRole: null,
          metadata: { previousStaffId: null, newStaffId: 'staff-1' },
        },
      ],
      [
        { id: 'staff-1', name: 'Drita Gashi' },
        { id: 'admin-1', name: 'Arta Admin' },
      ],
    ];

    expect(await read()).toEqual([
      {
        id: 'assignment-a1',
        kind: 'assigned',
        timestamp: at,
        toHandlerName: 'Drita Gashi',
        fromHandlerName: null,
        actorName: 'Arta Admin',
        actorRole: 'admin',
      },
    ]);

    const [audit, people] = state.queries;
    expect(audit.table).toBe('audit_log');
    expect(audit.sql).toContain('"audit_log"."tenant_id" = $1');
    expect(audit.params).toEqual([
      'tenant-a',
      'claim',
      'claim-1',
      'assign_owner',
      'claim.assigned',
      'unassign_owner',
      'claim.unassigned',
    ]);
    expect(audit.sql).toContain('"audit_log"."action" in');
    expect(audit.limit).toBe(ASSIGNMENT_HISTORY_LIMIT);
    expect(people.table).toBe('user');
    expect(people.sql).toContain('"user"."tenant_id" = $1');
    expect(people.params).toEqual(['tenant-a', 'staff-1', 'admin-1']);
  });

  it('skips the name read when no audit row names a user', async () => {
    state.results = [[]];
    expect(await read()).toEqual([]);
    expect(state.queries).toHaveLength(1);
  });

  it.each([null, 'staff', 'branch_manager', 'member', 'agent', 'auditor', 'global_support'])(
    'returns nothing for a %s principal without opening a transaction',
    async role => {
      state.principal = role ? { userId: 'u', role } : null;
      expect(await read()).toEqual([]);
      expect(state.authorityCalls).toBe(0);
    }
  );

  it.each(['admin', 'super_admin'])('admits the %s principal', async role => {
    state.principal = { userId: 'u', role };
    state.results = [[]];
    await read();
    expect(state.authorityCalls).toBe(1);
  });

  it('fails closed to no entries and reports the failure without leaking it', async () => {
    state.fail = true;
    const result = await read();
    expect(result).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('SENTINEL');
    expect(state.captureException).toHaveBeenCalledTimes(1);
    expect(state.captureException.mock.calls[0][1]).toMatchObject({
      tags: { operation: 'getClaimAssignmentHistory' },
      extra: { claimId: 'claim-1', tenantId: 'tenant-a' },
    });
  });
});
