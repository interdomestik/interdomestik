import { afterEach, describe, expect, it } from 'vitest';

import {
  isKnownIdaFrontDoorHost,
  normalizeTenantHost,
  resolveTenantHostContext,
} from './tenant-front-door';

describe('tenant-front-door', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalIdaHost = process.env.IDA_HOST;

  afterEach(() => {
    if (originalIdaHost === undefined) {
      delete mutableEnv.IDA_HOST;
    } else {
      mutableEnv.IDA_HOST = originalIdaHost;
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

  it('resolves ida front-door hosts as public no-tenant context', () => {
    expect(resolveTenantHostContext('ida.localhost:3000')).toEqual({
      kind: 'public',
      tenantId: null,
      source: 'ida_front_door',
    });
  });

  it('keeps country and pilot hosts as tenant contexts', () => {
    expect(resolveTenantHostContext('ks.localhost:3000')).toEqual({
      kind: 'tenant',
      tenantId: 'tenant_ks',
      source: 'host',
    });
    expect(resolveTenantHostContext('pilot.127.0.0.1.nip.io:3000')).toEqual({
      kind: 'tenant',
      tenantId: 'pilot-mk',
      source: 'host',
    });
  });
});
