import srAdminClaims from '@/messages/sr/admin-claims.json';
import { describe, expect, it } from 'vitest';

describe('admin claims locale bundles', () => {
  it('keeps the Serbian admin claims bundle in Latin script for shell continuity', () => {
    expect(JSON.stringify(srAdminClaims)).not.toMatch(/[\u0400-\u04FF]/);
  });
});
