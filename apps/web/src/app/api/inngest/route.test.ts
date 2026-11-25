// @vitest-environment node
import publicEntries from '@/lib/public-entry-points.json';
import { headerKeys } from 'inngest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GET, POST, PUT } from './route';
import {
  callbackUrl,
  expectedFunctions,
  fallback,
  primary,
  request,
  signedResponseBody,
  signingFlows,
  unrelated,
} from './route.test-support';

const effects = vi.hoisted(() => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response(null, { status: 503 }));
  // The real SDK binds fetch and reads signing configuration when the route is loaded.
  vi.stubGlobal('fetch', fetch);
  for (const name of [
    'INNGEST_SIGNING_KEY',
    'INNGEST_SIGNING_KEY_FALLBACK',
    'INNGEST_EVENT_KEY',
    'INNGEST_DEV',
    'INNGEST_STREAMING',
  ]) {
    vi.stubEnv(name, undefined);
  }
  return {
    fetch,
    mintIngressCapability: vi.fn(() => Object.freeze({ synthetic: true })),
    processPolicyAnalysisRunService: vi.fn(),
    processClaimDocumentWorkflowRunService: vi.fn(),
    processEmailSequences: vi.fn(),
    processSeasonalCampaigns: vi.fn(),
    runNotificationDeliverySchedule: vi.fn(),
  };
});

vi.mock('@interdomestik/database/ingress-registrar', () => ({
  mintIngressCapability: effects.mintIngressCapability,
}));
vi.mock('@/app/api/policies/analyze/_services', () => ({
  processPolicyAnalysisRunService: effects.processPolicyAnalysisRunService,
}));
vi.mock('@/lib/ai/claim-workflows', () => ({
  PersistedClaimAiRetryableError: class extends Error {},
  processClaimDocumentWorkflowRunService: effects.processClaimDocumentWorkflowRunService,
}));
vi.mock('@interdomestik/domain-communications/cron-service', () => ({
  processEmailSequences: effects.processEmailSequences,
  processSeasonalCampaigns: effects.processSeasonalCampaigns,
}));
vi.mock('@/lib/notification-delivery-schedule', () => ({
  runNotificationDeliverySchedule: effects.runNotificationDeliverySchedule,
}));

function expectNoEffects() {
  for (const effect of Object.values(effects)) expect(effect).not.toHaveBeenCalled();
}

async function expectNoIntrospection(response: Response) {
  expect(response.status).toBe(401);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ error: 'Unauthorized' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('INNGEST_SIGNING_KEY', primary);
  vi.stubEnv('INNGEST_SIGNING_KEY_FALLBACK', fallback);
  vi.stubEnv('INNGEST_EVENT_KEY', undefined);
  vi.stubEnv('INNGEST_DEV', undefined);
  vi.stubEnv('INNGEST_STREAMING', undefined);
  vi.stubEnv('INNGEST_ALLOW_IN_BAND_SYNC', undefined);
  vi.stubEnv('INNGEST_SERVE_HOST', new URL(callbackUrl).origin);
  vi.stubEnv('INNGEST_SERVE_PATH', '/api/inngest');
  effects.processPolicyAnalysisRunService.mockResolvedValue({ status: 'completed' });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

it('refuses unsigned GET without side effects', async () => {
  const response = await GET(request('GET'));
  expect(response.status).toBe(401);
  await expectNoIntrospection(response);
  expectNoEffects();
});

it('refuses unsigned POST without side effects', async () => {
  for (const execution of ['extraction', 'notifications'] as const) {
    await expectNoIntrospection(await POST(request('POST', { execution })));
  }
  expectNoEffects();
});

it('refuses unsigned PUT without side effects', async () => {
  const response = await PUT(request('PUT', { syncKind: 'in_band' }));
  expect(response.status).toBe(401);
  await expectNoIntrospection(response);
  expectNoEffects();
});

it.each(['invalid', 'expired'] as const)(
  'refuses %s signatures on all three methods',
  async kind => {
    const options = {
      key: kind === 'invalid' ? unrelated : primary,
      timestamp: kind === 'expired' ? String(Math.floor(Date.now() / 1000) - 301) : undefined,
    };
    await expectNoIntrospection(await GET(request('GET', options)));

    for (const response of [
      await POST(request('POST', options)),
      await POST(request('POST', { ...options, execution: 'notifications' })),
      await PUT(request('PUT', { ...options, syncKind: 'in_band' })),
    ]) {
      expect(response.status).toBe(401);
      expect.soft(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(await response.json()).not.toHaveProperty('authentication_succeeded');
    }
    expectNoEffects();
  }
);

it.each(['missing', 'invalid', 'expired'] as const)(
  'returns HTTP 401 for %s POST signatures when streaming is forced',
  async kind => {
    vi.stubEnv('INNGEST_STREAMING', 'force');
    vi.resetModules();
    const fresh = await import('./route');

    const options = {
      key: { missing: undefined, invalid: unrelated, expired: primary }[kind],
      timestamp: kind === 'expired' ? String(Math.floor(Date.now() / 1000) - 301) : undefined,
    };
    for (const execution of ['extraction', 'notifications'] as const) {
      const response = await fresh.POST(request('POST', { ...options, execution }));
      // Wait for the full response so the denial also proves no deferred side effects.
      await response.text();
      expect(response.status).toBe(401);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    }
    expectNoEffects();
  }
);

it('requires signing configuration on a fresh handler', async () => {
  vi.stubEnv('INNGEST_SIGNING_KEY', undefined);
  vi.stubEnv('INNGEST_SIGNING_KEY_FALLBACK', undefined);
  vi.resetModules();
  const fresh = await import('./route');

  await expectNoIntrospection(await fresh.GET(request('GET', { key: primary })));
  expect((await fresh.POST(request('POST', { key: primary }))).status).toBe(401);
  expect((await fresh.PUT(request('PUT', { key: primary, syncKind: 'in_band' }))).status).toBe(401);
  expectNoEffects();
});

it('ignores an explicit dev-mode override and still requires valid signatures', async () => {
  vi.stubEnv('INNGEST_DEV', 'http://127.0.0.1:8288');
  vi.resetModules();
  const fresh = await import('./route');

  await expectNoIntrospection(await fresh.GET(request('GET')));
  expect((await fresh.POST(request('POST', { key: unrelated }))).status).toBe(401);
  expect((await fresh.PUT(request('PUT', { key: unrelated, syncKind: 'in_band' }))).status).toBe(
    401
  );
  expectNoEffects();

  const inspection = await fresh.GET(request('GET', { key: primary }));
  expect(inspection.status).toBe(200);
  expect(await signedResponseBody(inspection, primary)).toMatchObject({
    mode: 'cloud',
    authentication_succeeded: true,
  });
  expectNoEffects();
});

it.each([
  ['default', undefined, undefined],
  ['explicit out-of-band', 'out_of_band', undefined],
  ['configuration-forced fallback', 'in_band', 'false'],
  ['configuration-forced fallback with an empty setting', 'in_band', ''],
])('refuses %s PUT with zero outbound calls', async (_case, syncKind, setting) => {
  vi.stubEnv('INNGEST_ALLOW_IN_BAND_SYNC', setting);
  const response = await PUT(request('PUT', { key: primary, syncKind }));
  await expectNoIntrospection(response);
  expectNoEffects();
});

it.each(signingFlows)(
  'serves the signed %s inspection, sync and extraction flow',
  async (_case, key, streaming) => {
    vi.stubEnv('INNGEST_STREAMING', streaming);
    vi.resetModules();
    const fresh = await import('./route');

    const get = await fresh.GET(request('GET', { key }));
    expect(get.status).toBe(200);
    expect(get.headers.get('Cache-Control')).toBe('private, no-store');
    expect(get.headers.get('Vary')).toContain(headerKeys.Signature);
    expect(await signedResponseBody(get, key)).toMatchObject({
      app_id: 'interdomestik-web',
      authentication_succeeded: true,
      extra: { is_streaming: false },
      function_count: 4,
      mode: 'cloud',
    });

    const put = await fresh.PUT(request('PUT', { key, syncKind: 'in_band' }));
    expect(put.status).toBe(200);
    expect(put.headers.get(headerKeys.InngestSyncKind)).toBe('in_band');
    const manifest = await signedResponseBody(put, key);
    expect(manifest).toHaveProperty('url', callbackUrl);
    expect(manifest).toHaveProperty('functions', expectedFunctions);
    expectNoEffects();

    const post = await fresh.POST(request('POST', { key }));
    expect(post.status).toBe(206);
    expect(await signedResponseBody(post, key)).toMatchObject([{ data: { status: 'completed' } }]);
    expect(effects.mintIngressCapability).toHaveBeenCalledExactlyOnceWith('inngest');
    expect(effects.processPolicyAnalysisRunService).toHaveBeenCalledExactlyOnceWith({
      runId: 'policy-test',
      tenantId: 'synthetic-tenant',
      ingress: expect.any(Object),
    });
    expect(effects.processClaimDocumentWorkflowRunService).not.toHaveBeenCalled();
    expect(effects.processEmailSequences).not.toHaveBeenCalled();
    expect(effects.processSeasonalCampaigns).not.toHaveBeenCalled();
    expect(effects.runNotificationDeliverySchedule).not.toHaveBeenCalled();
    expect(effects.fetch).not.toHaveBeenCalled();
  }
);

it.each(signingFlows)(
  'drains signed %s notification executions with a fresh capability each time',
  async (_case, key, streaming) => {
    vi.stubEnv('INNGEST_STREAMING', streaming);
    vi.resetModules();
    const fresh = await import('./route');
    const summary = { tenants: 1, tenantFailures: 1, sent: 1 };
    effects.runNotificationDeliverySchedule.mockResolvedValue(summary);

    for (const execution of [1, 2]) {
      const post = await fresh.POST(
        request('POST', { key, execution: 'notifications', runId: `notification-run-${execution}` })
      );
      expect(post.status).toBe(206);
      expect(await signedResponseBody(post, key)).toMatchObject([{ data: summary }]);
      expect(effects.runNotificationDeliverySchedule).toHaveBeenCalledTimes(execution);
      const drainArgs = effects.runNotificationDeliverySchedule.mock.calls[execution - 1];
      expect(drainArgs).toHaveLength(1);
      expect(drainArgs[0]).toBe(effects.mintIngressCapability.mock.results[execution - 1].value);
    }

    expect(effects.mintIngressCapability.mock.calls).toEqual([['inngest'], ['inngest']]);
    expect(effects.runNotificationDeliverySchedule.mock.calls[0][0]).not.toBe(
      effects.runNotificationDeliverySchedule.mock.calls[1][0]
    );
    expect(effects.processPolicyAnalysisRunService).not.toHaveBeenCalled();
    expect(effects.processClaimDocumentWorkflowRunService).not.toHaveBeenCalled();
    expect(effects.processEmailSequences).not.toHaveBeenCalled();
    expect(effects.processSeasonalCampaigns).not.toHaveBeenCalled();
    expect(effects.fetch).not.toHaveBeenCalled();
  }
);

it('registers exactly three SDK-authenticated Inngest methods with writes limited to POST', () => {
  const module = 'apps/web/src/app/api/inngest/route.ts';
  const entries = publicEntries.entries.filter(
    entry => entry.module === module || entry.id.startsWith('inngest-')
  );
  expect(entries).toMatchObject([
    { id: 'inngest-get', module, method: 'GET', authentication: 'library', writes: false },
    { id: 'inngest-post', module, method: 'POST', authentication: 'library', writes: true },
    { id: 'inngest-put', module, method: 'PUT', authentication: 'library', writes: false },
  ]);
});
