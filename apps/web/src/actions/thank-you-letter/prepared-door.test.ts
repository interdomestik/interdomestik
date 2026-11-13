import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { stubDeploymentOrigin } from '@/lib/deployment-origin.test-support';
import { prepareThankYouLetterCore, sendPreparedThankYouLetterCore } from './send.core';

const provider = vi.hoisted(() => vi.fn());
vi.mock('@/lib/tenant/tenant-hosts', () => ({ coerceTenantId: () => 'tenant_ks' }));

const production = 'https://ida.interdomestik.com';
const params = {
  email: 'member@example.test',
  memberName: 'Member <a href="https://insurer.example.test">report</a>',
  memberNumber: 'MEM-1',
  planName: 'Family',
  planPrice: 'EUR 20',
  planInterval: 'year',
  memberSince: new Date('2026-01-01T00:00:00Z'),
  expiresAt: new Date('2027-01-01T00:00:00Z'),
  providerReference: 'sub_1',
  tenantId: 'tenant_ks',
  locale: 'de' as const,
};
const delivery = {
  tenantId: params.tenantId,
  providerReference: params.providerReference,
  idempotencyKey: 'membership-confirmation:v1:tenant_ks:sub_1',
};
beforeEach(() => {
  stubDeploymentOrigin();
  vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
  vi.stubEnv('PLAYWRIGHT', '0');
  vi.stubEnv('SMTP_HOST', '');
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  provider
    .mockReset()
    .mockResolvedValue(new Response(JSON.stringify({ id: 'mail' }), { status: 200 }));
  vi.stubGlobal('fetch', provider);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('delivers the actual serialized prepared thank-you with its current door and immutable copy', async () => {
  const request = prepareThankYouLetterCore(params);
  const saved = JSON.stringify(request);
  stubDeploymentOrigin('production', production);
  const result = await sendPreparedThankYouLetterCore({ ...delivery, request: JSON.parse(saved) });
  expect(result).toEqual({ success: true, id: 'mail' });
  expect(provider).toHaveBeenCalledOnce();
  const [url, options] = provider.mock.calls[0];
  expect(url).toBe('https://api.resend.com/emails');
  expect(options.headers.get('Idempotency-Key')).toBe(delivery.idempotencyKey);
  expect(JSON.parse(options.body)).toMatchObject({
    subject: request.subject,
    html: request.html.replaceAll('https://staging.interdomestik.com', production),
    text: request.text.replaceAll('https://staging.interdomestik.com', production),
  });
  expect(JSON.stringify(request)).toBe(saved);
});

it('refuses the actual legacy prepared thank-you with zero provider calls', async () => {
  const prepared = prepareThankYouLetterCore(params);
  const request = Object.fromEntries(
    Object.entries(prepared).filter(([key]) => key !== 'source')
  ) as Omit<typeof prepared, 'source'>;
  await expect(sendPreparedThankYouLetterCore({ ...delivery, request })).rejects.toThrow(
    'email_source_required'
  );
  expect(provider).not.toHaveBeenCalled();
});

it('refuses a foreign structured thank-you URL before any provider call', async () => {
  const request = prepareThankYouLetterCore(params);
  const saved = JSON.parse(JSON.stringify(request));
  saved.source.params.dashboardUrl = 'https://evil.test/steal';
  await expect(sendPreparedThankYouLetterCore({ ...delivery, request: saved })).rejects.toThrow(
    'Invalid email application destination'
  );
  expect(provider).not.toHaveBeenCalled();
});
