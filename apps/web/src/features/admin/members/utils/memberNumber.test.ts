import { describe, expect, it } from 'vitest';
import {
  formatMemberNumber,
  isMemberNumberSearch,
  isValidMemberNumber,
  parseMemberNumber,
  parseMemberNumberPrefix,
} from './memberNumber';

describe('Global Member Number Utils', () => {
  describe('isValidMemberNumber', () => {
    it('validates correct format', () => {
      expect(isValidMemberNumber('MEM-2026-000123')).toBe(true);
      expect(isValidMemberNumber('MEM-2024-999999')).toBe(true);
    });

    it('rejects incorrect formats', () => {
      expect(isValidMemberNumber('MEM-2026-123')).toBe(false); // Too short
      expect(isValidMemberNumber('MEM-26-000123')).toBe(false); // Bad year
      expect(isValidMemberNumber('USER-2026-000123')).toBe(false); // Bad prefix
      expect(isValidMemberNumber('MEM-2026-0001234')).toBe(false); // Too long
      expect(isValidMemberNumber('random string')).toBe(false);
    });
  });

  describe('parseMemberNumber', () => {
    it('parses valid numbers', () => {
      const result = parseMemberNumber('MEM-2026-000123');
      expect(result).toEqual({ year: 2026, sequence: 123 });
    });

    it('returns null for invalid numbers', () => {
      expect(parseMemberNumber('invalid')).toBeNull();
      expect(parseMemberNumber('MEM-2026-1')).toBeNull();
    });
  });

  describe('isMemberNumberSearch', () => {
    it('detects member number queries', () => {
      expect(isMemberNumberSearch('MEM-')).toBe(true);
      expect(isMemberNumberSearch('MEM-2026')).toBe(true);
      expect(isMemberNumberSearch('MEM-2026-001')).toBe(true);
    });

    it('ignores non-member queries', () => {
      expect(isMemberNumberSearch('CLAIM-123')).toBe(false);
      expect(isMemberNumberSearch('John Doe')).toBe(false);
    });
  });

  describe('parseMemberNumberPrefix', () => {
    it('parses partial search queries', () => {
      expect(parseMemberNumberPrefix('MEM-2026-')).toEqual({ year: 2026, partialSeq: '' });
      expect(parseMemberNumberPrefix('MEM-2026-01')).toEqual({ year: 2026, partialSeq: '01' });
    });

    it('returns null for too short inputs', () => {
      expect(parseMemberNumberPrefix('MEM-')).toBeNull(); // Valid search but no year yet
    });
  });

  describe('formatMemberNumber', () => {
    it('formats correctly with padding', () => {
      expect(formatMemberNumber(2026, 123)).toBe('MEM-2026-000123');
      expect(formatMemberNumber(2026, 1)).toBe('MEM-2026-000001');
      expect(formatMemberNumber(2025, 999999)).toBe('MEM-2025-999999');
    });
  });
});
