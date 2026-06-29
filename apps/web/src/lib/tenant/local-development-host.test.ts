import { describe, expect, it } from 'vitest';

import { isLocalDevelopmentHost } from './local-development-host';

describe('isLocalDevelopmentHost', () => {
  it('accepts exact loopback development hosts', () => {
    expect(isLocalDevelopmentHost('localhost')).toBe(true);
    expect(isLocalDevelopmentHost('ks.localhost:3000')).toBe(true);
    expect(isLocalDevelopmentHost('pilot.127.0.0.1.nip.io')).toBe(true);
  });

  it('accepts supported country nip.io aliases', () => {
    expect(isLocalDevelopmentHost('ks.10.0.0.1.nip.io:3000')).toBe(true);
    expect(isLocalDevelopmentHost('mk.192.168.1.20.nip.io')).toBe(true);
  });

  it('rejects substring lookalikes', () => {
    expect(isLocalDevelopmentHost('ks.localhost.evil.example:3333')).toBe(false);
    expect(isLocalDevelopmentHost('127.0.0.1.evil.example')).toBe(false);
    expect(isLocalDevelopmentHost('evil.10.0.0.1.nip.io')).toBe(false);
    expect(isLocalDevelopmentHost('ks.999.0.0.1.nip.io')).toBe(false);
  });
});
