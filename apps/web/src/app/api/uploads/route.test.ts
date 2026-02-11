import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  storageFrom: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  findClaimFirst: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSession,
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'evidence-123',
}));

vi.mock('@interdomestik/database', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  claims: { id: 'id', tenantId: 'tenant_id' },
  db: {
    query: {
      claims: {
        findFirst: hoisted.findClaimFirst,
      },
    },
  },
  createAdminClient: () => ({
    storage: {
      from: hoisted.storageFrom,
    },
  }),
}));

describe('POST /api/uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.storageFrom.mockReturnValue({
      createSignedUploadUrl: hoisted.createSignedUploadUrl,
    });
    hoisted.createSignedUploadUrl.mockResolvedValue({
      data: { token: 'tok-1', signedUrl: 'https://signed.example.com/upload' },
      error: null,
    });
    hoisted.findClaimFirst.mockResolvedValue({ id: 'claim-1', userId: 'user-1' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getSession.mockResolvedValue(null);

    const req = new Request('http://localhost:3000/api/uploads', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'file.pdf',
        fileType: 'application/pdf',
        fileSize: 100,
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 for invalid payload', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' },
    });

    const req = new Request('http://localhost:3000/api/uploads', {
      method: 'POST',
      body: JSON.stringify({ fileName: '' }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid payload' });
  });

  it('returns 415 when mime type not allowed', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' },
    });

    const req = new Request('http://localhost:3000/api/uploads', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'file.exe',
        fileType: 'application/x-msdownload',
        fileSize: 100,
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(415);
    expect(data).toEqual({ error: 'File type not allowed' });
  });

  it('returns 413 when file is too large', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' },
    });

    const req = new Request('http://localhost:3000/api/uploads', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'file.pdf',
        fileType: 'application/pdf',
        fileSize: 11 * 1024 * 1024,
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(413);
    expect(data).toEqual({ error: 'File too large' });
  });

  it('returns 404 when claim does not exist', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' },
    });
    hoisted.findClaimFirst.mockResolvedValue(null);

    const req = new Request('http://localhost:3000/api/uploads', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'file.pdf',
        fileType: 'application/pdf',
        fileSize: 100,
        claimId: 'claim-404',
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data).toEqual({ error: 'Claim not found' });
  });

  it('returns 403 when claim is owned by someone else', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' },
    });
    hoisted.findClaimFirst.mockResolvedValue({ id: 'claim-1', userId: 'user-OTHER' });

    const req = new Request('http://localhost:3000/api/uploads', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'file.pdf',
        fileType: 'application/pdf',
        fileSize: 100,
        claimId: 'claim-1',
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data).toEqual({ error: 'Forbidden' });
  });

  it('returns 200 with signed upload details', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET', 'claim-evidence');

    hoisted.getSession.mockResolvedValue({
      user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' },
    });

    const req = new Request('http://localhost:3000/api/uploads', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'My File.pdf',
        fileType: 'application/pdf',
        fileSize: 100,
        claimId: 'claim-1',
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual(
      expect.objectContaining({
        upload: expect.objectContaining({
          token: 'tok-1',
          signedUrl: 'https://signed.example.com/upload',
          expiresIn: 300,
        }),
        classification: 'pii',
      })
    );

    expect(data.upload.path).toContain(
      '/tenants/tenant_mk/claims/user-1/claim-1/evidence-123-My_File.pdf'
    );
    expect(hoisted.storageFrom).toHaveBeenCalledWith('claim-evidence');
    expect(hoisted.createSignedUploadUrl).toHaveBeenCalled();
  });

  it('returns 500 when bucket is missing in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET', '');

    hoisted.getSession.mockResolvedValue({
      user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' },
    });

    const req = new Request('http://localhost:3000/api/uploads', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'file.pdf',
        fileType: 'application/pdf',
        fileSize: 100,
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data).toEqual({ error: 'Supabase evidence bucket is not configured' });
    expect(hoisted.storageFrom).not.toHaveBeenCalled();
  });
});
