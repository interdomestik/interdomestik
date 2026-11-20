import { describe, expect, it } from 'vitest';
import { membershipStatusKey } from './membership-status';

describe('membership display status keys', () => {
  it.each(['ACTIVE', 'active', 'Active'])('normalizes %s for catalog lookup', status => {
    expect(membershipStatusKey(status)).toBe('active');
  });
  it('uses explicit empty and unknown labels', () => {
    expect(membershipStatusKey(null)).toBe('none');
    expect(membershipStatusKey('internal-enum')).toBe('unknown');
  });
});
