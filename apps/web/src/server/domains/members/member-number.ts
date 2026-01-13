import { db } from '@interdomestik/database';
import { memberCounters, user } from '@interdomestik/database/schema';
import { eq, sql } from 'drizzle-orm';
import { formatMemberNumber } from '../../../features/admin/members/utils/memberNumber';

const MAX_RETRIES = 3;

/**
 * Atomically generates and assigns a Global Member Number to a user.
 *
 * Rules:
 * 1. Immutable: If user already has a number, returns existing.
 * 2. Atomic: Uses member_counters table with INSERT ... ON CONFLICT logic.
 * 3. Safe: Retries the entire operation if a conflict occurs.
 * 4. Format: MEM-{YYYY}-{NNNNNN}
 */
export async function generateMemberNumber(
  txOrDb: any, // Accepts transaction or db instance (loose type for Drizzle flexibility)
  userId: string,
  year: number
): Promise<string> {
  // Use provided transaction or default db
  const dbExecutor = txOrDb || db;

  // 1. Check immutability (Optimistic check)
  // We do this inside the loop/transaction block usually, but a quick read first saves ops.
  const existing = await dbExecutor
    .select({ memberNumber: user.memberNumber })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (existing[0]?.memberNumber) {
    return existing[0].memberNumber;
  }

  // 2. Retry Loop for Atomic Generation
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      return await dbExecutor.transaction(async (tx: any) => {
        // Double-check inside transaction lock (for strict correctness)
        const current = await tx
          .select({ memberNumber: user.memberNumber })
          .from(user)
          .where(eq(user.id, userId))
          .limit(1);

        if (current[0]?.memberNumber) {
          return current[0].memberNumber;
        }

        // Atomic Increment
        // INSERT ... ON CONFLICT (year) DO UPDATE SET last_number = last_number + 1 RETURNING last_number
        const counterResult = await tx
          .insert(memberCounters)
          .values({ year, lastNumber: 1 })
          .onConflictDoUpdate({
            target: memberCounters.year,
            set: { lastNumber: sql`${memberCounters.lastNumber} + 1` },
          })
          .returning({ lastNumber: memberCounters.lastNumber });

        const seq = counterResult[0].lastNumber;
        const newMemberNumber = formatMemberNumber(year, seq);
        const issuedAt = new Date();

        // Assign to User
        await tx
          .update(user)
          .set({
            memberNumber: newMemberNumber,
            memberNumberIssuedAt: issuedAt,
          })
          .where(eq(user.id, userId));

        return newMemberNumber;
      });
    } catch (error) {
      attempt++;
      // Check if it's a unique constraint violation on member_counters or user (race condition)
      // If we exhausted retries, throw
      if (attempt >= MAX_RETRIES) {
        throw new Error(
          `Failed to generate member number for user ${userId} after ${MAX_RETRIES} attempts: ${error}`
        );
      }
      // Small random delay before retry to desynchronize contenders
      await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
    }
  }

  throw new Error('Unexpected exit from member generation loop');
}
