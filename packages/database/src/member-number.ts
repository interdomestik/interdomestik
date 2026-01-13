/**
 * Global Member Number Generator
 *
 * Format: MEM-{YYYY}-{NNNNNN}
 * - YYYY: Year of issuance
 * - NNNNNN: Zero-padded 6-digit sequence (per year)
 *
 * This module lives in @interdomestik/database to be importable by:
 * - Domain packages (domain-users, etc.)
 * - Backfill scripts
 * - Auth hooks
 *
 * Requirements:
 * - Atomic counter using INSERT ... ON CONFLICT DO UPDATE
 * - Immutability: Never overwrite existing memberNumber
 * - Race-safe: Conditional UPDATE with IS NULL check + rowsAffected validation
 * - Retry with jitter for commit-time conflicts
 */

import { and, eq, isNull, sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';

import { memberCounters, user } from './schema';

// Constants
const MAX_RETRIES = 3;
const MEMBER_NUMBER_REGEX = /^MEM-(\d{4})-(\d{6})$/;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateMemberNumberParams {
  userId: string;
  joinedAt: Date; // Use the date the user joined/created for year semantics
}

export interface GenerateMemberNumberResult {
  memberNumber: string;
  isNew: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Format Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formats a member number in canonical format: MEM-{YYYY}-{NNNNNN}
 */
export function formatMemberNumber(year: number, sequence: number): string {
  if (sequence < 1 || sequence > 999999) {
    throw new Error(`Sequence out of range: ${sequence}`);
  }
  const paddedSeq = sequence.toString().padStart(6, '0');
  return `MEM-${year}-${paddedSeq}`;
}

/**
 * Parses a member number string into year and sequence.
 */
export function parseMemberNumber(input: string): { year: number; sequence: number } | null {
  if (!input) return null;
  const match = input.match(MEMBER_NUMBER_REGEX);
  if (!match) return null;
  return {
    year: parseInt(match[1], 10),
    sequence: parseInt(match[2], 10),
  };
}

/**
 * Validates if the input matches the member number format.
 */
export function isValidMemberNumber(input: string): boolean {
  return MEMBER_NUMBER_REGEX.test(input);
}

/**
 * Checks if input looks like a member number search query.
 */
export function isMemberNumberSearch(input: string): boolean {
  if (!input) return false;
  return input.toUpperCase().startsWith('MEM-');
}

// ─────────────────────────────────────────────────────────────────────────────
// Generator (Transaction-based)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a globally unique member number for a user.
 *
 * MUST be called within a transaction. The function:
 * 1. Checks if user already has a memberNumber (immutability)
 * 2. Derives year from joinedAt date
 * 3. Atomically increments the year counter using INSERT ON CONFLICT
 * 4. Conditionally updates user with memberNumber IS NULL check
 *
 * @param tx - Drizzle transaction object
 * @param params - userId and joinedAt date
 * @returns The member number (new or existing)
 */
export async function generateMemberNumber(
  tx: PgTransaction<any, any, any>,
  params: GenerateMemberNumberParams
): Promise<GenerateMemberNumberResult> {
  const { userId, joinedAt } = params;
  const year = joinedAt.getFullYear();

  // 1. Role guard: Check eligibility BEFORE incrementing counter
  // This prevents wasted sequence numbers for non-member or missing users
  const eligibilityCheck = await tx
    .select({ role: user.role, memberNumber: user.memberNumber })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!eligibilityCheck[0]) {
    throw new Error(`Cannot assign member number: User ${userId} not found`);
  }

  if (eligibilityCheck[0].role !== 'member') {
    throw new Error(
      `Cannot assign member number: User ${userId} role is '${eligibilityCheck[0].role}', not 'member'`
    );
  }

  // Return early if already assigned (immutability)
  if (eligibilityCheck[0].memberNumber) {
    return {
      memberNumber: eligibilityCheck[0].memberNumber,
      isNew: false,
    };
  }

  // 2. Atomic counter increment (only reached if user is eligible member without number)
  // INSERT year with lastNumber=1, or increment if exists
  const counterResult = await tx
    .insert(memberCounters)
    .values({ year, lastNumber: 1 })
    .onConflictDoUpdate({
      target: memberCounters.year,
      set: { lastNumber: sql`${memberCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: memberCounters.lastNumber });

  const sequence = counterResult[0].lastNumber;
  const newMemberNumber = formatMemberNumber(year, sequence);
  const issuedAt = new Date();

  // 3. Conditional update: Only set if memberNumber IS NULL and role='member'
  // This prevents race condition overwrites
  const updateResult = await tx
    .update(user)
    .set({
      memberNumber: newMemberNumber,
      memberNumberIssuedAt: issuedAt,
    })
    .where(and(eq(user.id, userId), isNull(user.memberNumber), eq(user.role, 'member')))
    .returning({ id: user.id });

  // 4. Check if update succeeded
  if (updateResult.length === 0) {
    // Race condition: Another transaction won. Re-read the existing value.
    const raceResult = await tx
      .select({ memberNumber: user.memberNumber })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (raceResult[0]?.memberNumber) {
      return {
        memberNumber: raceResult[0].memberNumber,
        isNew: false,
      };
    }

    // User doesn't exist or is not a member
    throw new Error(
      `Cannot assign member number: User ${userId} not found or role is not 'member'`
    );
  }

  return {
    memberNumber: newMemberNumber,
    isNew: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Wrapper with Retry (for use outside existing transactions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a member number with retry logic for standalone use.
 * Wraps the operation in its own transaction.
 *
 * @param db - Drizzle database instance
 * @param params - userId and year for number generation
 */
export async function generateMemberNumberWithRetry(
  db: { transaction: (fn: (tx: any) => Promise<any>) => Promise<any> },
  params: GenerateMemberNumberParams
): Promise<GenerateMemberNumberResult> {
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      return await db.transaction(async tx => {
        return generateMemberNumber(tx, params);
      });
    } catch (error) {
      attempt++;
      if (attempt >= MAX_RETRIES) {
        throw error;
      }
      // Jitter before retry
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 10));
    }
  }

  throw new Error('Unexpected exit from retry loop');
}
