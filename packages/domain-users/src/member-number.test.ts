import {
  formatMemberNumber,
  isValidMemberNumber,
  parseMemberNumber,
} from '@interdomestik/database/member-number';
import { describe, expect, it } from 'vitest';

describe('Member Number Module (Canonical)', () => {
  describe('formatMemberNumber', () => {
    it('formats with zero-padding', () => {
      expect(formatMemberNumber(2026, 1)).toBe('MEM-2026-000001');
      expect(formatMemberNumber(2026, 123)).toBe('MEM-2026-000123');
      expect(formatMemberNumber(2026, 999999)).toBe('MEM-2026-999999');
    });

    it('handles year rollover', () => {
      expect(formatMemberNumber(2025, 1)).toBe('MEM-2025-000001');
      expect(formatMemberNumber(2027, 1)).toBe('MEM-2027-000001');
    });

    it('throws for out of range sequence', () => {
      expect(() => formatMemberNumber(2026, 0)).toThrow('Sequence out of range');
      expect(() => formatMemberNumber(2026, 1000000)).toThrow('Sequence out of range');
    });
  });

  describe('parseMemberNumber', () => {
    it('parses valid member numbers', () => {
      expect(parseMemberNumber('MEM-2026-000123')).toEqual({
        year: 2026,
        sequence: 123,
      });
      expect(parseMemberNumber('MEM-2025-999999')).toEqual({
        year: 2025,
        sequence: 999999,
      });
    });

    it('returns null for invalid formats', () => {
      expect(parseMemberNumber('')).toBeNull();
      expect(parseMemberNumber('MEM-2026-123')).toBeNull(); // Too short
      expect(parseMemberNumber('MEM-26-000123')).toBeNull(); // Bad year
      expect(parseMemberNumber('USER-2026-000123')).toBeNull(); // Wrong prefix
      expect(parseMemberNumber('random')).toBeNull();
    });
  });

  describe('isValidMemberNumber', () => {
    it('validates correct format', () => {
      expect(isValidMemberNumber('MEM-2026-000001')).toBe(true);
      expect(isValidMemberNumber('MEM-2024-999999')).toBe(true);
    });

    it('rejects incorrect formats', () => {
      expect(isValidMemberNumber('MEM-2026-1')).toBe(false);
      expect(isValidMemberNumber('CLAIM-2026-000001')).toBe(false);
      expect(isValidMemberNumber('')).toBe(false);
    });
  });

  // Integration tests for generateMemberNumber require a real DB connection
  // and are covered in backfill/e2e tests
});
