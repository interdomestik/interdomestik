import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebhookRequest, fixtureWebhookSecret } from '../route.test-support';

const hoisted = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  resolveBillingEntityFromPathSegment: vi.fn(),
  getPaddleAndConfigForEntity: vi.fn(),
  handlePaddleWebhookEntityCore: vi.fn(),
  setTag: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

vi.mock('@interdomestik/domain-membership-billing/paddle-server', () => ({
  resolveBillingEntityFromPathSegment: hoisted.resolveBillingEntityFromPathSegment,
  getPaddleAndConfigForEntity: hoisted.getPaddleAndConfigForEntity,
}));

vi.mock('./_core', () => ({
  handlePaddleWebhookEntityCore: hoisted.handlePaddleWebhookEntityCore,
}));

vi.mock('@sentry/nextjs', () => ({
  setTag: hoisted.setTag,
  captureException: hoisted.captureException,
}));

import { POST } from './route';

describe('POST /api/webhooks/paddle/[entity]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(new Response('limited', { status: 429 }));
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each([
    { entity: 'ks', signed: true },
    { entity: 'zz', signed: false },
  ])(
    'refuses before every effect (entity: $entity, signed delivery: $signed)',
    async ({ entity, signed }) => {
      vi.stubEnv('PADDLE_WEBHOOK_SECRET_KEY_KS', signed ? fixtureWebhookSecret : undefined);
      const req = createWebhookRequest(`/api/webhooks/paddle/${entity}`, signed);
      const readBody = vi.spyOn(req, 'text');
      const readHeader = vi.spyOn(req.headers, 'get');
      const readParams = vi.fn(async () => ({ entity }));
      const context = {
        get params() {
          return readParams();
        },
      };

      const res = await POST(req, context);

      expect(res.status).toBe(503);
      expect(res.headers.get('Retry-After')).toBe('3600');
      expect(await res.json()).toEqual({ code: 'PADDLE_CLOSED', error: 'Paddle is closed' });
      expect(hoisted.enforceRateLimit).not.toHaveBeenCalled();
      expect(readParams).not.toHaveBeenCalled();
      expect(hoisted.resolveBillingEntityFromPathSegment).not.toHaveBeenCalled();
      expect(hoisted.getPaddleAndConfigForEntity).not.toHaveBeenCalled();
      expect(readBody).not.toHaveBeenCalled();
      expect(readHeader).not.toHaveBeenCalled();
      expect(hoisted.setTag).not.toHaveBeenCalled();
      expect(hoisted.captureException).not.toHaveBeenCalled();
      // Receipt, entitlement, user, lead, and onboarding effects are behind the core.
      expect(hoisted.handlePaddleWebhookEntityCore).not.toHaveBeenCalled();
    }
  );
});
