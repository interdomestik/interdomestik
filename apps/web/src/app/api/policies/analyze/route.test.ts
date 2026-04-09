import { type NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  analyzePolicyImages: vi.fn(),
  analyzePolicyText: vi.fn(),
  inngestSend: vi.fn(),
  upload: vi.fn(),
  returning: vi.fn(),
  values: vi.fn(),
  transaction: vi.fn(),
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

vi.mock('@/lib/inngest/client', () => ({
  inngest: {
    send: hoisted.inngestSend,
  },
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
    transaction: hoisted.transaction,
  },
}));

describe('POST /api/policies/analyze', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    hoisted.getSession.mockResolvedValue({ user: { id: 'user-1', tenantId: 'tenant_mk' } });
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.analyzePolicyImages.mockResolvedValue({ provider: 'Test' });
    hoisted.analyzePolicyText.mockResolvedValue({ provider: 'Test' });
    hoisted.inngestSend.mockResolvedValue({ ids: ['event-1'] });
    hoisted.upload.mockResolvedValue({ error: null });
    hoisted.returning.mockResolvedValue([{ id: 'policy-1' }]);
    hoisted.values.mockImplementation(() => ({
      returning: hoisted.returning,
    }));
    hoisted.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        insert: () => ({
          values: hoisted.values,
        }),
      })
    );

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
    expect(res).toBeDefined();
    expect(res!.status).toBe(503);
  }, 10000);

  it('queues a valid upload and returns 202 with a run id', async () => {
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
    expect(res).toBeDefined();
    expect(res!.status).toBe(202);
    await expect(res!.json()).resolves.toEqual(
      expect.objectContaining({
        success: true,
        runId: expect.any(String),
        status: 'queued',
      })
    );
    expect(hoisted.analyzePolicyImages).not.toHaveBeenCalled();
    expect(hoisted.analyzePolicyText).not.toHaveBeenCalled();
    expect(hoisted.inngestSend).toHaveBeenCalledOnce();
  });
});
