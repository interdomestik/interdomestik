import { describe, expect, it } from 'vitest';
import { getClaimSelectionCloseHref, getSelectedClaimId } from './claim-selection';

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

describe('getClaimSelectionCloseHref', () => {
  it('clears selected while preserving unrelated query params', () => {
    const params = new URLSearchParams('status=open&selected=claim-2&page=3');
    expect(getClaimSelectionCloseHref(params)).toBe('?status=open&page=3');
  });

  it('clears claimId direct selection while preserving unrelated query params', () => {
    const params = new URLSearchParams('claimId=claim-42&tab=open');
    expect(getClaimSelectionCloseHref(params)).toBe('?tab=open');
  });

  it('clears both selection aliases when both are present', () => {
    const params = new URLSearchParams('selected=claim-2&claimId=claim-1');
    expect(getClaimSelectionCloseHref(params)).toBe('?');
  });

  it('returns null when no selection query is present', () => {
    const params = new URLSearchParams('tab=open');
    expect(getClaimSelectionCloseHref(params)).toBeNull();
  });
});
