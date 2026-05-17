import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

// prettier-ignore
const m = vi.hoisted(() => {
  const select = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), limit: vi.fn() };
  const update = { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn() };
  const insert = { values: vi.fn() };
  const dbSelect = vi.fn(() => select), dbUpdate = vi.fn(() => update), dbInsert = vi.fn(() => insert);
  const txUpdate = vi.fn(() => update), txInsert = vi.fn(() => insert);
  const columns = new Proxy({}, { get: (_target, prop) => String(prop) });
  const withTenantContext = vi.fn(async (_context: { tenantId: string }, action: (tx: unknown) => Promise<unknown>) => await action({ insert: txInsert, update: txUpdate }));
  return { columns, dbInsert, dbSelect, dbUpdate, insert, select, txInsert, txUpdate, update, withTenantContext };
});

// prettier-ignore
vi.mock('@interdomestik/database', () => ({ db: { insert: m.dbInsert, select: m.dbSelect, update: m.dbUpdate }, withTenantContext: m.withTenantContext }));

// prettier-ignore
vi.mock('@interdomestik/database/schema', () => ({ npsSurveyResponses: m.columns, npsSurveyTokens: m.columns }));

vi.mock('drizzle-orm', () => ({ and: vi.fn(), eq: vi.fn(), isNull: vi.fn() }));
vi.mock('nanoid', () => ({ nanoid: () => 'test-id-123' }));

const tokenRow = (overrides: Record<string, unknown> = {}) => ({
  expiresAt: new Date('2999-01-01T00:00:00.000Z'),
  id: 'tok-1',
  subscriptionId: 'sub-1',
  tenantId: 'tenant-1',
  usedAt: null,
  userId: 'user-1',
  ...overrides,
});

function post(body: unknown, headers?: HeadersInit) {
  return POST(
    new Request('http://localhost:3000/api/public/nps', {
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers,
      method: 'POST',
    })
  );
}

// prettier-ignore
describe('POST /api/public/nps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.select.from.mockReturnThis(); m.select.where.mockReturnThis(); m.select.limit.mockReturnValue([]);
    m.update.set.mockReturnThis(); m.update.where.mockReturnThis(); m.update.returning.mockResolvedValue([]);
    m.insert.values.mockResolvedValue(undefined);
    m.dbSelect.mockReturnValue(m.select); m.dbUpdate.mockReturnValue(m.update); m.dbInsert.mockReturnValue(m.insert);
    m.txUpdate.mockReturnValue(m.update); m.txInsert.mockReturnValue(m.insert);
    m.withTenantContext.mockImplementation(async (_context: { tenantId: string }, action: (tx: unknown) => Promise<unknown>) => await action({ insert: m.txInsert, update: m.txUpdate }));
  });

  it.each([['not-json', 400, { error: 'Invalid JSON' }], [{ token: 'abc', score: 11 }, 400, { error: 'Invalid request' }]])('rejects invalid submission %#', async (body, status, expected) => {
    const response = await post(body);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(expected);
  });

  it.each([[[], 404, { error: 'Invalid token' }], [[tokenRow({ expiresAt: new Date('2000-01-01T00:00:00.000Z') })], 410, { error: 'Token expired' }], [[tokenRow({ usedAt: new Date('2025-01-01T00:00:00.000Z') })], 200, { success: true, alreadySubmitted: true }]])('handles token state %#', async (rows, status, expected) => {
    m.select.limit.mockReturnValue(rows);
    const response = await post({ token: 'valid-token-12345', score: 7 });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(expected);
  });

  it('submits through the token tenant context', async () => {
    m.select.limit.mockReturnValue([tokenRow()]); m.update.returning.mockResolvedValue([{ id: 'tok-1' }]);
    const response = await post({ token: 'valid-token-12345', score: 9, comment: 'Great' }, { 'user-agent': 'vitest' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(m.withTenantContext).toHaveBeenCalledWith({ tenantId: 'tenant-1' }, expect.any(Function));
    expect(m.dbUpdate).not.toHaveBeenCalled(); expect(m.dbInsert).not.toHaveBeenCalled();
    expect(m.txUpdate).toHaveBeenCalledWith(expect.anything()); expect(m.txInsert).toHaveBeenCalledWith(expect.anything());
    expect(m.insert.values).toHaveBeenCalledWith(expect.objectContaining({ comment: 'Great', score: 9, subscriptionId: 'sub-1', tenantId: 'tenant-1', tokenId: 'tok-1', userId: 'user-1' }));
  });

  it('does not insert when the token update loses the race', async () => {
    m.select.limit.mockReturnValue([tokenRow()]); m.update.returning.mockResolvedValue([]);
    const response = await post({ token: 'valid-token-12345', score: 6 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, alreadySubmitted: true });
    expect(m.withTenantContext).toHaveBeenCalledWith({ tenantId: 'tenant-1' }, expect.any(Function));
    expect(m.txUpdate).toHaveBeenCalledWith(expect.anything());
    expect(m.txInsert).not.toHaveBeenCalled(); expect(m.insert.values).not.toHaveBeenCalled();
  });
});

describe('GET /api/public/nps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.select.from.mockReturnThis();
    m.select.where.mockReturnThis();
    m.select.limit.mockReturnValue([]);
  });

  it.each([
    ['http://localhost:3000/api/public/nps', 400, { error: 'Missing token' }],
    ['http://localhost:3000/api/public/nps?token=bad', 404, { error: 'Invalid token' }],
  ])('rejects invalid lookup %#', async (url, status, expected) => {
    const response = await GET(new Request(url));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual(expected);
  });

  it('returns valid:true for fresh token', async () => {
    m.select.limit.mockReturnValue([tokenRow()]);

    const response = await GET(new Request('http://localhost:3000/api/public/nps?token=ok'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true, alreadySubmitted: false });
  });
});
