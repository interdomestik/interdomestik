import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  return {
    captureLifecycle: vi.fn(),
    generateMemberNumber: vi.fn(),
    query,
    dbAdmin: { select: vi.fn(() => query) },
  };
});

vi.mock('@interdomestik/database/db', () => ({ dbAdmin: hoisted.dbAdmin }));
vi.mock('@interdomestik/database/member-number', () => ({
  generateMemberNumberWithRetry: hoisted.generateMemberNumber,
}));
vi.mock('@interdomestik/database/schema', () => ({
  user: { id: 'id', role: 'role', memberNumber: 'memberNumber', createdAt: 'createdAt' },
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn(() => 'predicate') }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('./member-number-observability', () => ({
  captureMemberNumberLifecycleEvent: hoisted.captureLifecycle,
}));

import { databaseHooks } from './hooks';

type AsyncHook = (value: Record<string, unknown>) => Promise<unknown>;

function hookAt(path: 'user' | 'session'): AsyncHook {
  const hooks = databaseHooks as unknown as {
    user: { create: { after: AsyncHook } };
    session: { create: { after: AsyncHook } };
  };
  return path === 'user' ? hooks.user.create.after : hooks.session.create.after;
}

describe('member-number auth hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.query.from.mockReturnValue(hoisted.query);
    hoisted.query.where.mockReturnValue(hoisted.query);
    hoisted.generateMemberNumber.mockResolvedValue({
      memberNumber: 'MEM-2026-000001',
      isNew: true,
    });
  });

  it('preserves post-create assignment without identifier-bearing observability', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await hookAt('user')({
      id: 'user-secret',
      role: 'member',
      memberNumber: null,
      email: 'private@example.com',
      tenantId: 'tenant-secret',
      createdAt: new Date('2026-02-03T00:00:00Z'),
    });

    expect(hoisted.generateMemberNumber).toHaveBeenCalledWith(hoisted.dbAdmin, {
      userId: 'user-secret',
      joinedAt: new Date('2026-02-03T00:00:00Z'),
    });
    expect(hoisted.captureLifecycle).toHaveBeenCalledWith('user_create_after_assigned', {
      createdYear: 2026,
      isNew: true,
    });
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/user-secret|MEM-2026|private@example/);
    log.mockRestore();
  });

  it('preserves session self-heal without identifier-bearing observability', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    hoisted.query.limit.mockResolvedValue([
      {
        role: 'member',
        memberNumber: null,
        createdAt: new Date('2025-01-02T00:00:00Z'),
        email: 'private@example.com',
        tenantId: 'tenant-secret',
      },
    ]);

    await hookAt('session')({ userId: 'user-secret' });

    expect(hoisted.generateMemberNumber).toHaveBeenCalledWith(hoisted.dbAdmin, {
      userId: 'user-secret',
      joinedAt: new Date('2025-01-02T00:00:00Z'),
    });
    expect(hoisted.captureLifecycle.mock.calls).toEqual([
      ['self_heal_invoked', { createdYear: 2025 }],
      ['self_heal_resolved', { createdYear: 2025, isNew: true }],
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/user-secret|MEM-2026|private@example/);
    log.mockRestore();
  });
});
