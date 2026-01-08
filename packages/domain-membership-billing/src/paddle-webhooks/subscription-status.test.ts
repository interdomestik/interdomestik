import { describe, expect, it } from 'vitest';
import { mapPaddleStatus } from './subscription-status';

describe('mapPaddleStatus', () => {
  it('should map active to active', () => {
    expect(mapPaddleStatus('active')).toBe('active');
  });

  it('should map past_due to past_due', () => {
    expect(mapPaddleStatus('past_due')).toBe('past_due');
  });

  it('should map paused to paused', () => {
    expect(mapPaddleStatus('paused')).toBe('paused');
  });

  it('should map canceled and deleted to canceled', () => {
    expect(mapPaddleStatus('canceled')).toBe('canceled');
    expect(mapPaddleStatus('deleted')).toBe('canceled');
  });

  it('should map trialing to trialing', () => {
    expect(mapPaddleStatus('trialing')).toBe('trialing');
  });

  it('should map unknown statuses to expired', () => {
    expect(mapPaddleStatus('unknown')).toBe('expired');
    expect(mapPaddleStatus('')).toBe('expired');
  });
});
