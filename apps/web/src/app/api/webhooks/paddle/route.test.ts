import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebhookRequest, fixtureWebhookSecret } from './route.test-support';

const hoisted = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  getPaddle: vi.fn(),
  handlePaddleWebhookCore: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

vi.mock('./_core', () => ({
  handlePaddleWebhookCore: hoisted.handlePaddleWebhookCore,
}));

vi.mock('@interdomestik/domain-membership-billing/paddle-server', () => ({
  getPaddle: hoisted.getPaddle,
}));

import { POST } from './route';

describe('POST /api/webhooks/paddle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(new Response('limited', { status: 429 }));
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([true, false])('refuses before every effect (signed delivery: %s)', async signed => {
    vi.stubEnv('PADDLE_WEBHOOK_SECRET_KEY', signed ? fixtureWebhookSecret : undefined);
    const req = createWebhookRequest('/api/webhooks/paddle', signed);
    const readBody = vi.spyOn(req, 'text');
    const readHeader = vi.spyOn(req.headers, 'get');

    const res = await POST(req);

    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('3600');
    expect(await res.json()).toEqual({ code: 'PADDLE_CLOSED', error: 'Paddle is closed' });
    expect(hoisted.enforceRateLimit).not.toHaveBeenCalled();
    expect(hoisted.getPaddle).not.toHaveBeenCalled();
    expect(readBody).not.toHaveBeenCalled();
    expect(readHeader).not.toHaveBeenCalled();
    // Receipt, entitlement, user, lead, and onboarding effects are behind the core.
    expect(hoisted.handlePaddleWebhookCore).not.toHaveBeenCalled();
  });
});
