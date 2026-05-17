import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ op: 'and', conditions })),
  enforceRateLimit: vi.fn(),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  gte: vi.fn((left: unknown, right: unknown) => ({ op: 'gte', left, right })),
  insert: {
    onConflictDoNothing: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    values: vi.fn().mockReturnThis(),
  },
  logAuditEvent: vi.fn(),
  lte: vi.fn((left: unknown, right: unknown) => ({ op: 'lte', left, right })),
  authorizeCronRequest: vi.fn(),
  runNpsCronCore: vi.fn(),
  select: {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    where: vi.fn().mockReturnThis(),
  },
  sendNpsSurveyEmail: vi.fn(),
  table: new Proxy({}, { get: (_target, prop) => String(prop) }),
  txInsert: vi.fn(),
  txSelect: {
    from: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    where: vi.fn().mockReturnThis(),
  },
  txSet: vi.fn(),
  txUpdate: vi.fn(),
  txWhere: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

vi.mock('../_auth', () => ({
  authorizeCronRequest: hoisted.authorizeCronRequest,
}));

vi.mock('./_core', () => ({
  runNpsCronCore: hoisted.runNpsCronCore,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: hoisted.logAuditEvent,
}));

vi.mock('@/lib/email', () => ({
  sendNpsSurveyEmail: hoisted.sendNpsSurveyEmail,
}));

vi.mock('@interdomestik/database', () => ({
  db: { select: vi.fn(() => hoisted.select) },
  withTenantContext: hoisted.withTenantContext,
}));

vi.mock('@interdomestik/database/schema', () => ({
  engagementEmailSends: hoisted.table,
  npsSurveyTokens: hoisted.table,
  subscriptions: hoisted.table,
  user: hoisted.table,
}));

vi.mock('drizzle-orm', () => ({
  and: hoisted.and,
  eq: hoisted.eq,
  gte: hoisted.gte,
  lte: hoisted.lte,
}));

vi.mock('nanoid', () => ({ nanoid: (size?: number) => (size ? 'survey-token' : 'id-1') }));

import { GET } from './route';

describe('GET /api/cron/nps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.authorizeCronRequest.mockReturnValue(true);
    hoisted.runNpsCronCore.mockResolvedValue({ sent: 1, skipped: 2, errors: 0 });
    hoisted.select.from.mockReturnThis();
    hoisted.select.innerJoin.mockReturnThis();
    hoisted.select.where.mockReturnThis();
    hoisted.select.limit.mockResolvedValue([]);
    hoisted.txSelect.from.mockReturnThis();
    hoisted.txSelect.where.mockReturnThis();
    hoisted.txSelect.limit.mockResolvedValue([{ token: 'survey-token' }]);
    hoisted.insert.values.mockReturnThis();
    hoisted.insert.onConflictDoNothing.mockReturnThis();
    hoisted.insert.returning.mockResolvedValue([{ id: 'send-1' }]);
    hoisted.txInsert.mockReturnValue(hoisted.insert);
    hoisted.txUpdate.mockReturnValue({ set: hoisted.txSet });
    hoisted.txSet.mockReturnValue({ where: hoisted.txWhere });
    hoisted.txWhere.mockResolvedValue(undefined);
    hoisted.withTenantContext.mockImplementation(
      async (
        _context: { tenantId: string; role: string },
        action: (tx: unknown) => Promise<unknown>
      ) =>
        await action({
          insert: hoisted.txInsert,
          select: vi.fn(() => hoisted.txSelect),
          update: hoisted.txUpdate,
        })
    );
    hoisted.sendNpsSurveyEmail.mockResolvedValue({ success: true, id: 'message-1' });
  });

  it('returns early when rate limited', async () => {
    hoisted.enforceRateLimit.mockResolvedValue(new Response('limited', { status: 429 }));

    const req = new Request('http://localhost:3000/api/cron/nps');
    const res = await GET(req);

    expect(res.status).toBe(429);
    expect(await res.text()).toBe('limited');
  });

  it('returns 401 when unauthorized', async () => {
    hoisted.authorizeCronRequest.mockReturnValue(false);

    const req = new Request('http://localhost:3000/api/cron/nps');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('returns success payload when authorized', async () => {
    const req = new Request('http://localhost:3000/api/cron/nps');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ success: true, results: { sent: 1, skipped: 2, errors: 0 } });

    expect(hoisted.runNpsCronCore).toHaveBeenCalledTimes(1);
    expect(hoisted.runNpsCronCore).toHaveBeenCalledWith({
      now: expect.any(Date),
      headers: req.headers,
    });
  });

  it('writes NPS send and token rows through the subscription tenant context', async () => {
    vi.resetModules();
    hoisted.select.limit.mockResolvedValueOnce([
      {
        email: 'member@example.com',
        name: 'Member One',
        subId: 'sub-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
      },
    ]);
    const { runNpsCronCore } = await vi.importActual<typeof import('./_core')>('./_core');

    const results = await runNpsCronCore({
      headers: new Headers(),
      now: new Date('2026-01-15T00:00:00.000Z'),
    });

    expect(results.sent).toBe(1);
    expect(hoisted.withTenantContext).toHaveBeenNthCalledWith(
      1,
      { tenantId: 'tenant-1', role: 'system' },
      expect.any(Function)
    );
    expect(hoisted.withTenantContext).toHaveBeenNthCalledWith(
      2,
      { tenantId: 'tenant-1', role: 'system' },
      expect.any(Function)
    );
    expect(hoisted.txInsert).toHaveBeenCalledWith(expect.anything());
    expect(hoisted.txUpdate).toHaveBeenCalledWith(expect.anything());
    expect(hoisted.insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: 'engagement:sub-1:nps_v1',
        tenantId: 'tenant-1',
        userId: 'user-1',
      })
    );
  });
});
