// @vitest-environment node
import { createHmac } from 'node:crypto';
import { headerKeys } from 'inngest';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GET, POST, PUT } from './route';

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

const primary = '01'.repeat(32);
const fallback = '02'.repeat(32);
const unrelated = '03'.repeat(32);
const callbackUrl = 'https://release-candidate.example.test/api/inngest';
const registrationBody = JSON.stringify({ url: callbackUrl });
const extractionFunctions = [
  ['interdomestik-web-policy-extraction-requested', 'policy/extract.requested'],
  ['interdomestik-web-claim-intake-extraction-requested', 'claim/intake-extract.requested'],
  ['interdomestik-web-legal-document-extraction-requested', 'legal/extract.requested'],
] as const;

function signature(body: string, key: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  const digest = createHmac('sha256', key).update(body).update(timestamp).digest('hex');
  return `t=${timestamp}&s=${digest}`;
}

function request(
  method: 'GET' | 'POST' | 'PUT',
  options: { key?: string; timestamp?: string; syncKind?: string } = {}
) {
  const [functionId, eventName] = extractionFunctions[0];
  // The provider signs canonical JSON. Fixture keys are in canonical order.
  const executionBody = JSON.stringify({
    ctx: { attempt: 0, run_id: 'run-test', stack: { current: 0, stack: [] }, use_api: false },
    event: { data: { runId: 'policy-test', tenantId: 'synthetic-tenant' }, name: eventName },
    events: [],
    steps: {},
    version: 1,
  });
  const body = method === 'PUT' ? registrationBody : method === 'POST' ? executionBody : undefined;
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (options.key) {
    headers.set(headerKeys.Signature, signature(body ?? '', options.key, options.timestamp));
  }
  if (options.syncKind) headers.set(headerKeys.InngestSyncKind, options.syncKind);

  return new NextRequest(method === 'POST' ? `${callbackUrl}?fnId=${functionId}` : callbackUrl, {
    method,
    headers,
    body,
  });
}

function expectNoEffects() {
  for (const effect of Object.values(effects)) expect(effect).not.toHaveBeenCalled();
}

async function expectNoIntrospection(response: Response) {
  expect(response.status).toBe(401);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({ error: 'Unauthorized' });
}

async function signedResponseBody(response: Response, key: string) {
  const body = await response.text();
  const responseSignature = response.headers.get(headerKeys.Signature);
  expect(responseSignature).toBeTruthy();
  const timestamp = new URLSearchParams(responseSignature ?? '').get('t');
  expect(timestamp).toBeTruthy();
  expect(responseSignature === signature(body, key, timestamp ?? '')).toBe(true);
  const parsed: unknown = JSON.parse(body);
  return parsed;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('INNGEST_SIGNING_KEY', primary);
  vi.stubEnv('INNGEST_SIGNING_KEY_FALLBACK', fallback);
  vi.stubEnv('INNGEST_EVENT_KEY', undefined);
  vi.stubEnv('INNGEST_DEV', undefined);
  vi.stubEnv('INNGEST_STREAMING', undefined);
  vi.stubEnv('INNGEST_ALLOW_IN_BAND_SYNC', undefined);
  vi.stubEnv('INNGEST_SERVE_HOST', 'https://release-candidate.example.test');
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
  const response = await POST(request('POST'));
  expect(response.status).toBe(401);
  await expectNoIntrospection(response);
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
      await PUT(request('PUT', { ...options, syncKind: 'in_band' })),
    ]) {
      expect(response.status).toBe(401);
      expect(await response.json()).not.toHaveProperty('authentication_succeeded');
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

it.each([
  ['primary', primary],
  ['fallback', fallback],
])('serves signed extraction and registration with the %s key', async (_keyName, key) => {
  const get = await GET(request('GET', { key }));
  expect(get.status).toBe(200);
  expect(await signedResponseBody(get, key)).toMatchObject({
    app_id: 'interdomestik-web',
    authentication_succeeded: true,
    function_count: 3,
    mode: 'cloud',
  });

  const put = await PUT(request('PUT', { key, syncKind: 'in_band' }));
  expect(put.status).toBe(200);
  expect(put.headers.get(headerKeys.InngestSyncKind)).toBe('in_band');
  expect(await signedResponseBody(put, key)).toMatchObject({
    url: callbackUrl,
    functions: extractionFunctions.map(([id, event]) => ({
      id,
      triggers: [{ event }],
      steps: { step: { runtime: { url: `${callbackUrl}?fnId=${id}&stepId=step` } } },
    })),
  });
  expectNoEffects();

  const post = await POST(request('POST', { key }));
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
  expect(effects.fetch).not.toHaveBeenCalled();
});
