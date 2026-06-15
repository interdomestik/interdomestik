import { describe, expect, it } from 'vitest';

import { resolveTenantFromHost } from './tenant-hosts';

describe('tenant host security boundaries', () => {
  it('does not treat country-label lookalike hosts as tenant hosts', () => {
    expect(resolveTenantFromHost('ks.attacker.test')).toBeNull();
  });
});
