import { type NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  analyzePolicyImages: vi.fn(),
  analyzePolicyText: vi.fn(),
  upload: vi.fn(),
  returning: vi.fn(),
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

vi.mock('@/lib/ai/policy-analyzer', () => ({
  analyzePolicyImages: hoisted.analyzePolicyImages,
  analyzePolicyText: hoisted.analyzePolicyText,
}));

vi.mock('@interdomestik/database', () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload: hoisted.upload,
      }),
    },
  }),
  db: {
    insert: () => ({
      values: () => ({
        returning: hoisted.returning,
      }),
    }),
  },
  policies: { id: 'id' },
}));

describe('POST /api/policies/analyze', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    hoisted.getSession.mockResolvedValue({ user: { id: 'user-1', tenantId: 'tenant_mk' } });
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.analyzePolicyImages.mockResolvedValue({ provider: 'Test' });
    hoisted.analyzePolicyText.mockResolvedValue({ provider: 'Test' });
    hoisted.upload.mockResolvedValue({ error: null });
    hoisted.returning.mockResolvedValue([{ id: 'policy-1' }]);

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    process.env.POLICY_ANALYSIS_TIMEOUT_MS = '';
  });

  it('returns rate limit response directly', async () => {
    hoisted.enforceRateLimit.mockResolvedValue(
      new Response('Service unavailable', { status: 503 })
    );

    const { POST } = await import('./route');
    const req = {
      headers: new Headers(),
      formData: async () => new FormData(),
    };
    const res = await POST(req as unknown as NextRequest);

    expect(res.status).toBe(503);
  });

  it('treats missing content-type images as images', async () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
    const file = {
      name: 'image.png',
      type: '',
      size: pngHeader.length,
      arrayBuffer: async () => pngHeader.buffer,
    } as File;
    const formData = {
      get: (key: string) => (key === 'file' ? file : null),
    } as FormData;

    const req = {
      headers: new Headers(),
      formData: async () => formData,
    };

    const { POST } = await import('./route');
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    expect(hoisted.analyzePolicyImages).toHaveBeenCalledOnce();
    expect(hoisted.analyzePolicyText).not.toHaveBeenCalled();
  });

  it('returns 504 when analysis times out', async () => {
    process.env.POLICY_ANALYSIS_TIMEOUT_MS = '5';
    hoisted.analyzePolicyImages.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve({ provider: 'Test' }), 50))
    );

    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]);
    const file = {
      name: 'image.png',
      type: 'image/png',
      size: pngHeader.length,
      arrayBuffer: async () => pngHeader.buffer,
    } as File;
    const formData = {
      get: (key: string) => (key === 'file' ? file : null),
    } as FormData;

    const req = {
      headers: new Headers(),
      formData: async () => formData,
    };

    const { POST } = await import('./route');
    const res = await POST(req as unknown as NextRequest);
    const data = await res.json();

    expect(res.status).toBe(504);
    expect(data.error).toMatch(/timed out/i);
  });
});
