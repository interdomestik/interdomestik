import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  handlePaddleWebhookCore: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

vi.mock('./_core', () => ({
  handlePaddleWebhookCore: hoisted.handlePaddleWebhookCore,
}));

vi.mock('@paddle/paddle-node-sdk', () => ({
  Environment: { sandbox: 'sandbox' },
  Paddle: class Paddle {
    constructor() {
      return { mocked: true };
    }
  },
}));

import { POST } from './route';

describe('POST /api/webhooks/paddle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.handlePaddleWebhookCore.mockResolvedValue({ status: 200, body: { ok: true } });
    process.env.PADDLE_WEBHOOK_SECRET_KEY = 'whsec_test';
  });

  it('returns early when rate limited', async () => {
    hoisted.enforceRateLimit.mockResolvedValue(new Response('limited', { status: 429 }));

    const req = new Request('http://localhost:3000/api/webhooks/paddle', {
      method: 'POST',
      body: 'x',
    });

    const res = await POST(req as any);

    expect(res.status).toBe(429);
    expect(await res.text()).toBe('limited');
  });

  it('delegates to core and maps status/body', async () => {
    hoisted.handlePaddleWebhookCore.mockResolvedValue({
      status: 202,
      body: { accepted: true },
    });

    const req = new Request('http://localhost:3000/api/webhooks/paddle', {
      method: 'POST',
      headers: {
        'paddle-signature': 'sig_123',
      },
      body: 'payload',
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(202);
    expect(data).toEqual({ accepted: true });

    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledTimes(1);
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledWith(
      expect.objectContaining({
        signature: 'sig_123',
        secret: 'whsec_test',
        bodyText: 'payload',
        headers: req.headers,
      })
    );
  });
});
