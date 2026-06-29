import { describe, expect, it } from 'vitest';

import { isLocalDevelopmentHost } from './local-development-host';

describe('isLocalDevelopmentHost', () => {
  it('accepts exact loopback development hosts', () => {
    expect(isLocalDevelopmentHost('localhost')).toBe(true);
    expect(isLocalDevelopmentHost('ks.localhost:3000')).toBe(true);
    expect(isLocalDevelopmentHost('pilot.127.0.0.1.nip.io')).toBe(true);
  });

  it('rejects substring lookalikes', () => {
    expect(isLocalDevelopmentHost('ks.localhost.evil.example:3333')).toBe(false);
    expect(isLocalDevelopmentHost('127.0.0.1.evil.example')).toBe(false);
  });
});
