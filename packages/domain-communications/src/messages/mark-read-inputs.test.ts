import { PgDialect, QueryBuilder } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  context: vi.fn(),
  update: vi.fn(),
  where: vi.fn(),
  actorFindFirst: vi.fn(),
}));
vi.mock('@interdomestik/database', async () => {
  const { pgTable, text, boolean, timestamp } = await import('drizzle-orm/pg-core');
  return {
    withTenantContext: calls.context,
    user: pgTable('user', { id: text('id'), tenantId: text('tenant_id') }),
    claimMessages: pgTable('claim_messages', {
      id: text('id'),
      claimId: text('claim_id'),
      tenantId: text('tenant_id'),
      senderId: text('sender_id'),
      readAt: timestamp('read_at'),
      isInternal: boolean('is_internal'),
    }),
    claims: pgTable('claim', {
      id: text('id'),
      tenantId: text('tenant_id'),
      userId: text('user_id'),
      staffId: text('staff_id'),
      branchId: text('branch_id'),
    }),
    agentClients: pgTable('agent_clients', {
      memberId: text('member_id'),
      tenantId: text('tenant_id'),
      agentId: text('agent_id'),
      status: text('status'),
    }),
  };
});

import { markMessagesAsReadCore } from './mark-read';

const builder = new QueryBuilder();
const tx = {
  select: builder.select.bind(builder),
  update: calls.update,
  query: { user: { findFirst: calls.actorFindFirst } },
};
const input = (user: object, messageIds = ['message-1']) => ({
  session: { user } as Parameters<typeof markMessagesAsReadCore>[0]['session'],
  messageIds,
});
const user = (role = 'member') => ({ id: 'actor-1', tenantId: 'tenant-1', role, branchId: null });
const serialized = () => new PgDialect().sqlToQuery(calls.where.mock.calls[0][0]);

describe('mark-read scalar admission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.actorFindFirst.mockResolvedValue({ branchId: null });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    calls.context.mockImplementation((_context, action) => action(tx));
    calls.update.mockReturnValue({ set: () => ({ where: calls.where }) });
    calls.where.mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('preserves both actor ID reads and their order when a getter changes its string result', async () => {
    const events: string[] = [];
    const actor = {
      ...user(),
      get id() {
        const id = events.length ? 'access-actor' : 'sender-actor';
        events.push(id);
        return id;
      },
      get branchId() {
        events.push('branch');
        return null;
      },
    };
    expect(await markMessagesAsReadCore(input(actor))).toEqual({ success: true });
    expect(events).toEqual(['sender-actor', 'branch', 'access-actor']);
    expect(serialized().params).toEqual([
      'tenant-1',
      'message-1',
      'sender-actor',
      false,
      'tenant-1',
      'access-actor',
    ]);
  });

  it('keeps ID reads after the tenant-context wait', async () => {
    let resume!: () => void;
    const paused = new Promise<void>(resolve => {
      resume = resolve;
    });
    calls.context.mockImplementation(async (_context, action) => {
      await paused;
      return action(tx);
    });
    const actor = user();
    const pending = markMessagesAsReadCore(input(actor));
    actor.id = 'actor-after-wait';
    resume();
    expect(await pending).toEqual({ success: true });
    expect(serialized().params).toContain('actor-after-wait');
    expect(serialized().params).not.toContain('actor-1');
  });

  it.each(['tenant', 'role', 'recipient', 'access'] as const)(
    'rejects a SQLWrapper in %s without evaluating it',
    async slot => {
      const effect = vi.fn(() => {
        throw new Error('SQLWrapper must not execute');
      });
      const value = {
        get getSQL() {
          return effect();
        },
        toString: effect,
        valueOf: effect,
      };
      const actor: Record<string, unknown> = user();
      if (slot === 'tenant') actor.tenantId = { trim: () => value };
      if (slot === 'role') actor.role = value;
      if (slot === 'recipient') actor.id = value;
      if (slot === 'access') {
        let reads = 0;
        Object.defineProperty(actor, 'id', { get: () => (++reads === 1 ? 'sender' : value) });
      }
      expect(await markMessagesAsReadCore(input(actor))).toEqual({
        success: false,
        error: 'Failed to mark messages as read',
      });
      expect(effect).not.toHaveBeenCalled();
      expect(calls.update).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        'Error marking messages as read:',
        expect.objectContaining({ message: 'Invalid message access context' })
      );
    }
  );

  it.each(['member', 'agent', 'staff', 'branch_manager', 'admin', 'tenant_admin', 'super_admin'])(
    'keeps valid %s scope',
    async role => {
      const actor = { ...user(role), branchId: role === 'branch_manager' ? 'branch-1' : null };
      expect(await markMessagesAsReadCore(input(actor))).toEqual({ success: true });
      expect(calls.update).toHaveBeenCalledOnce();
      expect(serialized().params).toContain('tenant-1');
    }
  );

  it('uses one admitted agent identity for its current scope, sender exclusion and client links', async () => {
    const readId = vi.fn().mockReturnValueOnce('agent-1').mockReturnValue('different-agent');
    const actor = {
      ...user('agent'),
      get id() {
        return readId();
      },
    };
    expect(await markMessagesAsReadCore(input(actor))).toEqual({ success: true });
    expect(readId).toHaveBeenCalledOnce();
    expect(serialized().params).toContain('agent-1');
    expect(serialized().params).not.toContain('different-agent');
  });

  it('preserves empty IDs and missing-session paths before scalar reads', async () => {
    const read = vi.fn(() => {
      throw new Error('no scalar read');
    });
    const actor = {
      get id() {
        return read();
      },
      get role() {
        return read();
      },
    };
    expect(await markMessagesAsReadCore(input(actor, []))).toEqual({ success: true });
    expect(await markMessagesAsReadCore({ session: null, messageIds: ['message-1'] })).toEqual({
      success: false,
      error: 'Unauthorized',
    });
    expect(read).not.toHaveBeenCalled();
    expect(calls.context).not.toHaveBeenCalled();
  });

  it.each([0, true, Symbol('actor')])('rejects a non-string actor ID %s', async id => {
    expect(await markMessagesAsReadCore(input({ ...user(), id }))).toMatchObject({
      success: false,
    });
    expect(calls.update).not.toHaveBeenCalled();
  });

  it.each([null, undefined, ''])('preserves the existing role fallback for %s', async role => {
    expect(await markMessagesAsReadCore(input({ ...user(), role }))).toEqual({ success: true });
    expect(calls.context).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', role: 'user' },
      expect.any(Function)
    );
  });
});
