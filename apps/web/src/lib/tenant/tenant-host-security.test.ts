import { describe, expect, it } from 'vitest';

import { resolveEntryHostIdFromHeaders } from './host-id';
import { resolveTenantFromHost } from './tenant-hosts';

describe('tenant host security boundaries', () => {
  it('does not treat country-label lookalike hosts as tenant hosts', () => {
    expect(resolveTenantFromHost('ks.attacker.test')).toBeNull();
  });

  it('does not trust forwarded hosts for entry host telemetry by default', () => {
    const headers = new Headers({ host: 'attacker.test', 'x-forwarded-host': 'ks.localhost:3000' });

    expect(resolveEntryHostIdFromHeaders(headers)).toBeNull();
    expect(resolveEntryHostIdFromHeaders(headers, { trustForwardedHost: true })).toBe('tenant_ks');
  });
});
