import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnValue([]),
};

const mockUpdateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([]),
};

const mockInsertChain = {
  values: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@interdomestik/database', () => ({
  db: {
    select: () => mockSelectChain,
    update: () => mockUpdateChain,
    insert: () => mockInsertChain,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  npsSurveyTokens: {
    id: 'id',
    userId: 'user_id',
    subscriptionId: 'subscription_id',
    expiresAt: 'expires_at',
    usedAt: 'used_at',
    token: 'token',
  },
  npsSurveyResponses: {
    id: 'id',
    tokenId: 'token_id',
    userId: 'user_id',
    subscriptionId: 'subscription_id',
    score: 'score',
    comment: 'comment',
    createdAt: 'created_at',
    metadata: 'metadata',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'test-id-123',
}));

describe('POST /api/public/nps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectChain.from.mockReturnThis();
    mockSelectChain.where.mockReturnThis();
    mockSelectChain.limit.mockReturnValue([]);
    mockUpdateChain.set.mockReturnThis();
    mockUpdateChain.where.mockReturnThis();
    mockUpdateChain.returning.mockResolvedValue([]);
    mockInsertChain.values.mockResolvedValue(undefined);
  });

  it('returns 400 for invalid JSON', async () => {
    const request = new Request('http://localhost:3000/api/public/nps', {
      method: 'POST',
      body: 'not-json',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid JSON' });
  });

  it('returns 400 for invalid body', async () => {
    const request = new Request('http://localhost:3000/api/public/nps', {
      method: 'POST',
      body: JSON.stringify({ token: 'abc', score: 11 }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid request' });
  });

  it('returns 404 for invalid token', async () => {
    mockSelectChain.limit.mockReturnValue([]);

    const request = new Request('http://localhost:3000/api/public/nps', {
      method: 'POST',
      body: JSON.stringify({ token: 'valid-token-12345', score: 7 }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: 'Invalid token' });
  });

  it('returns 410 for expired token', async () => {
    mockSelectChain.limit.mockReturnValue([
      {
        id: 'tok-1',
        userId: 'user-1',
        subscriptionId: 'sub-1',
        expiresAt: new Date('2000-01-01T00:00:00.000Z'),
        usedAt: null,
      },
    ]);

    const request = new Request('http://localhost:3000/api/public/nps', {
      method: 'POST',
      body: JSON.stringify({ token: 'valid-token-12345', score: 7 }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(410);
    expect(data).toEqual({ error: 'Token expired' });
  });

  it('returns alreadySubmitted when token is already used', async () => {
    mockSelectChain.limit.mockReturnValue([
      {
        id: 'tok-1',
        userId: 'user-1',
        subscriptionId: 'sub-1',
        expiresAt: new Date('2999-01-01T00:00:00.000Z'),
        usedAt: new Date('2025-01-01T00:00:00.000Z'),
      },
    ]);

    const request = new Request('http://localhost:3000/api/public/nps', {
      method: 'POST',
      body: JSON.stringify({ token: 'valid-token-12345', score: 7 }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true, alreadySubmitted: true });
  });

  it('submits successfully for a fresh token', async () => {
    mockSelectChain.limit.mockReturnValue([
      {
        id: 'tok-1',
        userId: 'user-1',
        subscriptionId: 'sub-1',
        expiresAt: new Date('2999-01-01T00:00:00.000Z'),
        usedAt: null,
      },
    ]);
    mockUpdateChain.returning.mockResolvedValue([{ id: 'tok-1' }]);

    const request = new Request('http://localhost:3000/api/public/nps', {
      method: 'POST',
      headers: { 'user-agent': 'vitest' },
      body: JSON.stringify({ token: 'valid-token-12345', score: 9, comment: 'Great' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(mockInsertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenId: 'tok-1',
        userId: 'user-1',
        subscriptionId: 'sub-1',
        score: 9,
        comment: 'Great',
      })
    );
  });

  it('handles race: token becomes used before update', async () => {
    mockSelectChain.limit.mockReturnValue([
      {
        id: 'tok-1',
        userId: 'user-1',
        subscriptionId: 'sub-1',
        expiresAt: new Date('2999-01-01T00:00:00.000Z'),
        usedAt: null,
      },
    ]);
    mockUpdateChain.returning.mockResolvedValue([]);

    const request = new Request('http://localhost:3000/api/public/nps', {
      method: 'POST',
      body: JSON.stringify({ token: 'valid-token-12345', score: 6 }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true, alreadySubmitted: true });
  });
});

describe('GET /api/public/nps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectChain.from.mockReturnThis();
    mockSelectChain.where.mockReturnThis();
    mockSelectChain.limit.mockReturnValue([]);
  });

  it('returns 400 if token is missing', async () => {
    const request = new Request('http://localhost:3000/api/public/nps');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Missing token' });
  });

  it('returns 404 for invalid token', async () => {
    mockSelectChain.limit.mockReturnValue([]);

    const request = new Request('http://localhost:3000/api/public/nps?token=bad');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toEqual({ error: 'Invalid token' });
  });

  it('returns valid:true for fresh token', async () => {
    mockSelectChain.limit.mockReturnValue([
      {
        expiresAt: new Date('2999-01-01T00:00:00.000Z'),
        usedAt: null,
      },
    ]);

    const request = new Request('http://localhost:3000/api/public/nps?token=ok');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ valid: true, alreadySubmitted: false });
  });
});
