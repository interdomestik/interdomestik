import { afterEach, describe, expect, it } from 'vitest';

import { resolveTenantAppOrigin } from './tenant-hosts';
import { isLocalTenantAppHost } from './tenant-local-hosts';

describe('tenant app origin local-host security', () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalKsHost = process.env.KS_HOST;

  afterEach(() => {
    if (originalKsHost === undefined) {
      delete mutableEnv.KS_HOST;
      return;
    }
    mutableEnv.KS_HOST = originalKsHost;
  });

  it.each([
    'localhost',
    'ks.localhost',
    'ks.localhost:3000',
    '127.0.0.1',
    '127.0.0.1:3000',
    'ks.127.0.0.1.nip.io',
    'ks.10.0.2.15.nip.io:3000',
    'ks.192.168.1.20.nip.io',
    '[::1]:3000',
  ])('classifies %s as local', host => {
    expect(isLocalTenantAppHost(host)).toBe(true);
  });

  it.each([
    'localhost.attacker.test',
    'ks.localhost.attacker.test',
    'ks.127.0.0.1.nip.io.attacker.test',
    'ks.8.8.8.8.nip.io',
    'evilnip.io',
    'interdomestik.com',
  ])('does not classify %s as local', host => {
    expect(isLocalTenantAppHost(host)).toBe(false);
  });

  it('does not downgrade lookalike tenant hosts to http', () => {
    mutableEnv.KS_HOST = 'ks.127.0.0.1.nip.io.attacker.test';

    expect(resolveTenantAppOrigin('tenant_ks')).toBe('https://ks.127.0.0.1.nip.io.attacker.test');

    mutableEnv.KS_HOST = 'ks.localhost.attacker.test';

    expect(resolveTenantAppOrigin('tenant_ks')).toBe('https://ks.localhost.attacker.test');
  });

  it('keeps legitimate local tenant hosts on http', () => {
    mutableEnv.KS_HOST = 'ks.127.0.0.1.nip.io:3000';

    expect(resolveTenantAppOrigin('tenant_ks')).toBe('http://ks.127.0.0.1.nip.io:3000');
  });
});
