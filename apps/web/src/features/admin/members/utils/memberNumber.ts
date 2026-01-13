/**
 * Utility for parsing and validating Global Member Numbers.
 * Format: MEM-{YYYY}-{NNNNNN}
 * Example: MEM-2026-000123
 */

// Regex for strict exact match: MEM-YYYY-NNNNNN
const MEMBER_NUMBER_STRICT_REGEX = /^MEM-(\d{4})-(\d{6})$/;

// Regex for prefix match (search): MEM-YYYY- or MEM-YYYY-NNN
const MEMBER_NUMBER_PREFIX_REGEX = /^MEM-(\d{4})-(\d{0,6})$/;

export interface ParsedMemberNumber {
  year: number;
  sequence: number;
}

/**
 * Parses a Member Number string.
 * Returns { year, sequence } if valid, null otherwise.
 * strictly ensures the format is MEM-{YYYY}-{NNNNNN}.
 */
export function parseMemberNumber(input: string): ParsedMemberNumber | null {
  if (!input) return null;
  const match = input.match(MEMBER_NUMBER_STRICT_REGEX);
  if (!match) return null;

  return {
    year: parseInt(match[1], 10),
    sequence: parseInt(match[2], 10),
  };
}

/**
 * Validates if the input is a valid Member Number format.
 */
export function isValidMemberNumber(input: string): boolean {
  return MEMBER_NUMBER_STRICT_REGEX.test(input);
}

/**
 * Checks if the input looks like a Member Number search query (prefix compatible).
 * Useful for determining if we should trigger member search logic.
 */
export function isMemberNumberSearch(input: string): boolean {
  if (!input) return false;
  return input.startsWith('MEM-');
}

/**
 * Extracts year from a prefix search if possible.
 */
export function parseMemberNumberPrefix(
  input: string
): { year: number; partialSeq: string } | null {
  if (!input) return null;
  const match = input.match(MEMBER_NUMBER_PREFIX_REGEX);
  if (!match) return null;

  return {
    year: parseInt(match[1], 10),
    partialSeq: match[2],
  };
}

/**
 * Formats a year and sequence into a canonical Member Number.
 */
export function formatMemberNumber(year: number, sequence: number): string {
  const paddedSeq = sequence.toString().padStart(6, '0');
  return `MEM-${year}-${paddedSeq}`;
}
