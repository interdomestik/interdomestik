import { afterEach, describe, expect, it } from 'vitest';

import {
  isKnownIdaFrontDoorHost,
  normalizeTenantHost,
  resolveTenantHostContext,
} from './tenant-front-door';

describe('tenant-front-door', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalIdaHost = process.env.IDA_HOST;
  const originalVercelUrl = process.env.VERCEL_URL;

  afterEach(() => {
    if (originalIdaHost === undefined) {
      delete mutableEnv.IDA_HOST;
    } else {
      mutableEnv.IDA_HOST = originalIdaHost;
    }
    if (originalVercelUrl === undefined) {
      delete mutableEnv.VERCEL_URL;
    } else {
      mutableEnv.VERCEL_URL = originalVercelUrl;
    }
  });

  it('normalizes scheme, port, path, casing, and trailing dots', () => {
    expect(normalizeTenantHost('HTTPS://IDA.LOCALHOST:3000/sq/login.')).toBe('ida.localhost');
    expect(normalizeTenantHost('ida.127.0.0.1.nip.io:3000')).toBe('ida.127.0.0.1.nip.io');
    expect(normalizeTenantHost('ida.localhost.')).toBe('ida.localhost');
  });

  it('recognizes built-in and configured ida front-door hosts', () => {
    mutableEnv.IDA_HOST = 'https://front-door.localhost:3000';

    expect(isKnownIdaFrontDoorHost('ida.localhost:3000')).toBe(true);
    expect(isKnownIdaFrontDoorHost('front-door.localhost:3000')).toBe(true);
    expect(isKnownIdaFrontDoorHost('ks.localhost:3000')).toBe(false);
  });

  it('recognizes only the current Vercel deployment host as a front door', () => {
    mutableEnv.VERCEL_URL = 'interdomestik-preview-123.vercel.app';

    expect(isKnownIdaFrontDoorHost('interdomestik-preview-123.vercel.app')).toBe(true);
    expect(isKnownIdaFrontDoorHost('other-preview.vercel.app')).toBe(false);
  });

  it('resolves ida front-door hosts as public no-tenant context', () => {
    expect(resolveTenantHostContext('ida.localhost:3000')).toEqual({
      kind: 'public',
      tenantId: null,
      source: 'ida_front_door',
    });
  });

  it('keeps unknown hosts outside tenant and public contexts', () => {
    expect(resolveTenantHostContext('example.test')).toEqual({
      kind: 'unknown',
      tenantId: null,
      source: 'unknown_host',
    });
  });

  it('keeps country and pilot hosts as compatibility alias contexts', () => {
    expect(resolveTenantHostContext('ks.localhost:3000')).toEqual({
      kind: 'compatibility_alias',
      tenantId: 'tenant_ks',
      source: 'country_host_alias',
      defaultBookingTenantId: 'tenant_ks',
      hostAlias: 'ks',
    });
    expect(resolveTenantHostContext('pilot.127.0.0.1.nip.io:3000')).toEqual({
      kind: 'compatibility_alias',
      tenantId: 'pilot-mk',
      source: 'country_host_alias',
      defaultBookingTenantId: 'pilot-mk',
      hostAlias: 'pilot',
    });
  });
});
