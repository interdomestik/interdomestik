import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  storageFrom: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  findClaimFirst: vi.fn(),
  agentScope: vi.fn(),
}));

vi.mock('@/app/api/documents/agent-document-scope', () => ({
  hasAgentClaimDocumentScope: hoisted.agentScope,
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
  withTenantContext: async (
    _context: unknown,
    callback: (tx: { query: { claims: { findFirst: typeof hoisted.findClaimFirst } } }) => unknown
  ) => callback({ query: { claims: { findFirst: hoisted.findClaimFirst } } }),
  createAdminClient: () => ({
    storage: {
      from: hoisted.storageFrom,
    },
  }),
}));

type UploadRequestPayload = {
  fileName: string;
  fileType: string;
  fileSize: number;
  claimId?: string;
};

function mockUploadUserSession(
  overrides: Partial<{ id: string; role: string; tenantId: string }> = {}
) {
  hoisted.getSession.mockResolvedValue({
    user: {
      id: 'user-1',
      role: 'user',
      tenantId: 'tenant_mk',
      ...overrides,
    },
  });
}

function buildUploadRequest(overrides: Partial<UploadRequestPayload> = {}): Request {
  return new Request('http://localhost:3000/api/uploads', {
    method: 'POST',
    body: JSON.stringify({
      fileName: 'file.pdf',
      fileType: 'application/pdf',
      fileSize: 100,
      ...overrides,
    }),
  });
}

function mockClaim(overrides: Partial<{ userId: string; agentId: string }> = {}) {
  hoisted.findClaimFirst.mockResolvedValue({
    id: 'claim-1',
    tenantId: 'tenant_mk',
    userId: 'user-1',
    ...overrides,
  });
}
describe('POST /api/uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CLAIM_UPLOAD_INTENT_SECRET', 'test-upload-intent-secret-value-123456');
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.storageFrom.mockReturnValue({
      createSignedUploadUrl: hoisted.createSignedUploadUrl,
    });
    hoisted.createSignedUploadUrl.mockResolvedValue({
      data: { token: 'tok-1', signedUrl: 'https://signed.example.com/upload' },
      error: null,
    });
    mockClaim();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns 200 when the claim is in the agent scope', async () => {
    hoisted.agentScope.mockResolvedValue(true);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET', 'claim-evidence');

    hoisted.getSession.mockResolvedValue({
      user: { id: 'agent-1', role: 'agent', tenantId: 'tenant_mk' },
    });
    mockClaim({ userId: 'user-OTHER', agentId: 'agent-1' });

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
    expect(res.status).toBe(200);
    expect(hoisted.createSignedUploadUrl).toHaveBeenCalled();
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
    expect(res.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(data).toEqual(
      expect.objectContaining({
        upload: expect.objectContaining({
          id: 'evidence-123',
          token: 'tok-1',
          signedUrl: 'https://signed.example.com/upload',
          expiresIn: 300,
        }),
        classification: 'pii',
      })
    );
    expect(data.upload).not.toHaveProperty('intentToken');

    expect(data.upload.path).toBe('pii/tenants/tenant_mk/claims/claim-1/evidence-123.pdf');
    expect(hoisted.enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'api/uploads',
        productionSensitive: true,
      })
    );
    expect(hoisted.storageFrom).toHaveBeenCalledWith('claim-evidence');
    expect(hoisted.createSignedUploadUrl).toHaveBeenCalled();
  });

  it('does not issue a signed storage URL when upload intent signing is unavailable', async () => {
    vi.stubEnv('CLAIM_UPLOAD_INTENT_SECRET', '');
    vi.stubEnv('BETTER_AUTH_SECRET', '');

    mockUploadUserSession();

    const res = await POST(buildUploadRequest());
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data).toEqual({ error: 'Failed to create signed upload URL' });
    expect(hoisted.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('allows text files for claim evidence uploads', async () => {
    hoisted.getSession.mockResolvedValue({
      user: { id: 'user-1', role: 'user', tenantId: 'tenant_mk' },
    });

    const req = new Request('http://localhost:3000/api/uploads', {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'notes.txt',
        fileType: 'text/plain',
        fileSize: 120,
        claimId: 'claim-1',
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.upload.path).toContain('.txt');
    expect(hoisted.createSignedUploadUrl).toHaveBeenCalled();
  });

  it('falls back to the default bucket when production env leaves it unset', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET', '');

    mockUploadUserSession();

    const res = await POST(buildUploadRequest());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.upload.bucket).toBe('claim-evidence');
    expect(data.upload.intentToken).toEqual(expect.any(String));
    expect(hoisted.storageFrom).toHaveBeenCalledWith('claim-evidence');
  });
});
