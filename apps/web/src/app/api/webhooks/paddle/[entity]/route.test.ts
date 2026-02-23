import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const hoisted = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  resolveBillingEntityFromPathSegment: vi.fn(),
  getPaddleAndConfigForEntity: vi.fn(),
  handlePaddleWebhookCore: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

vi.mock('@interdomestik/domain-membership-billing/paddle-server', () => ({
  resolveBillingEntityFromPathSegment: hoisted.resolveBillingEntityFromPathSegment,
  getPaddleAndConfigForEntity: hoisted.getPaddleAndConfigForEntity,
}));

vi.mock('../_core', () => ({
  handlePaddleWebhookCore: hoisted.handlePaddleWebhookCore,
}));

import { POST } from './route';

describe('POST /api/webhooks/paddle/[entity]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.resolveBillingEntityFromPathSegment.mockReturnValue('ks');
    hoisted.getPaddleAndConfigForEntity.mockReturnValue({
      paddle: { mocked: true },
      config: {
        entity: 'ks',
        webhookSecret: 'whsec_ks',
      },
    });
    hoisted.handlePaddleWebhookCore.mockResolvedValue({ status: 200, body: { ok: true } });
  });

  it('returns early when rate limited', async () => {
    hoisted.enforceRateLimit.mockResolvedValue(new Response('limited', { status: 429 }));

    const req = new NextRequest('http://localhost:3000/api/webhooks/paddle/ks', {
      method: 'POST',
      body: 'x',
    });

    const res = await POST(req, { params: Promise.resolve({ entity: 'ks' }) });

    expect(res.status).toBe(429);
    expect(await res.text()).toBe('limited');
  });

  it('rejects unknown entities', async () => {
    hoisted.resolveBillingEntityFromPathSegment.mockReturnValue(null);

    const req = new NextRequest('http://localhost:3000/api/webhooks/paddle/zz', {
      method: 'POST',
      body: 'payload',
    });

    const res = await POST(req, { params: Promise.resolve({ entity: 'zz' }) });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data).toEqual({ error: 'Unknown billing entity' });
    expect(hoisted.handlePaddleWebhookCore).not.toHaveBeenCalled();
  });

  it('uses entity-scoped billing config for webhook handling', async () => {
    hoisted.handlePaddleWebhookCore.mockResolvedValue({
      status: 202,
      body: { accepted: true },
    });

    const req = new NextRequest('http://localhost:3000/api/webhooks/paddle/ks', {
      method: 'POST',
      headers: {
        'paddle-signature': 'sig_ks',
      },
      body: 'payload-ks',
    });

    const res = await POST(req, { params: Promise.resolve({ entity: 'ks' }) });
    const data = await res.json();

    expect(res.status).toBe(202);
    expect(data).toEqual({ accepted: true });
    expect(hoisted.resolveBillingEntityFromPathSegment).toHaveBeenCalledWith('ks');
    expect(hoisted.getPaddleAndConfigForEntity).toHaveBeenCalledWith('ks');
    expect(hoisted.handlePaddleWebhookCore).toHaveBeenCalledWith(
      expect.objectContaining({
        signature: 'sig_ks',
        secret: 'whsec_ks',
        bodyText: 'payload-ks',
        headers: req.headers,
      })
    );
    expect(hoisted.enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'api/webhooks/paddle',
        productionSensitive: true,
      })
    );
  });
});
