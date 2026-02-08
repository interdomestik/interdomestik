import { describe, expect, it } from 'vitest';
import { getSelectedClaimId } from './claim-selection';

describe('getSelectedClaimId', () => {
  it('uses claimId when selected is missing', () => {
    const params = new URLSearchParams('claimId=claim-42');
    expect(getSelectedClaimId(params)).toBe('claim-42');
  });

  it('prefers selected when both selected and claimId are present', () => {
    const params = new URLSearchParams('selected=claim-2&claimId=claim-1');
    expect(getSelectedClaimId(params)).toBe('claim-2');
  });

  it('returns null when no valid id is provided', () => {
    const params = new URLSearchParams();
    expect(getSelectedClaimId(params)).toBeNull();
  });
});
