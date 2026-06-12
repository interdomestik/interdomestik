import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { LOCALES } from '@/i18n/locales';

const mockEmitAuthTelemetryEvent = vi.fn();

vi.mock('@/i18n/routing', () => ({
  routing: {
    locales: LOCALES,
  },
}));

vi.mock('@/lib/telemetry', () => ({
  emitAuthTelemetryEvent: (...args: unknown[]) => mockEmitAuthTelemetryEvent(...args),
}));

import { proxy } from './proxy-logic';

const ORIGINAL_IDA_HOST = process.env.IDA_HOST;
const E2E_ENV_KEYS = ['INTERDOMESTIK_LOCAL_E2E', 'INTERDOMESTIK_E2E_DIAGNOSTICS', 'PLAYWRIGHT'];
let originalE2eEnv: Record<string, string | undefined>;

function restoreIdaHost(): void {
  if (ORIGINAL_IDA_HOST === undefined) {
    delete process.env.IDA_HOST;
    return;
  }

  process.env.IDA_HOST = ORIGINAL_IDA_HOST;
}

function restoreE2eEnv(): void {
  for (const key of E2E_ENV_KEYS) {
    const value = originalE2eEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function makeRequest(pathname: string, cookieHeader?: string, host = 'ida.localhost:3000') {
  const headers = new Headers({ host });
  if (cookieHeader) headers.set('cookie', cookieHeader);
  return new NextRequest(`http://${host}${pathname}`, { headers });
}

describe('proxy ida front-door context', () => {
  beforeEach(() => {
    originalE2eEnv = Object.fromEntries(E2E_ENV_KEYS.map(key => [key, process.env[key]]));
    process.env.INTERDOMESTIK_LOCAL_E2E = '1';
    process.env.INTERDOMESTIK_E2E_DIAGNOSTICS = '1';
    process.env.PLAYWRIGHT = '1';
    mockEmitAuthTelemetryEvent.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreE2eEnv();
    restoreIdaHost();
  });

  it('resolves ida.localhost as public no-tenant context without setting a tenant cookie', async () => {
    const response = await proxy(makeRequest('/sq'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-e2e-tenant')).toBe('none');
    expect(response.headers.get('x-e2e-tenant-context')).toBe('public');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('does not refresh stale tenant cookies on ida public requests', async () => {
    const response = await proxy(
      makeRequest('/sq/pricing', 'tenantId=tenant_mk', 'ida.127.0.0.1.nip.io:3000')
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-e2e-tenant')).toBe('none');
    expect(response.headers.get('x-e2e-tenant-context')).toBe('public');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('supports configured IDA_HOST as public no-tenant context', async () => {
    process.env.IDA_HOST = 'https://front-door.localhost:3000';

    const response = await proxy(makeRequest('/sq', undefined, 'front-door.localhost:3000'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-e2e-tenant')).toBe('none');
    expect(response.headers.get('x-e2e-tenant-context')).toBe('public');
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
