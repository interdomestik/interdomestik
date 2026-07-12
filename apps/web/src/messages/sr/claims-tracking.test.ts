import { describe, expect, it } from 'vitest';

import srClaimsTracking from './claims-tracking.json';

describe('Serbian claims tracking messages', () => {
  it('keeps MOB-03a vault consent copy in Serbian Latin', () => {
    const copy = Object.values(srClaimsTracking['claims-tracking'].vault_consent).join(' ');

    expect(copy).not.toMatch(/[\u0400-\u04ff]/u);
  });
});
