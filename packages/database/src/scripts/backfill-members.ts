/**
 * Backfill Script: Assign Member Numbers to Existing Members
 *
 * Usage: npx tsx src/scripts/backfill-members.ts
 *
 * Features:
 * - Uses CANONICAL generator from ../member-number.ts
 * - Deterministic ordering: createdAt ASC, id ASC
 * - Per-year counter initialization from max existing sequence
 * - Idempotent: skips members with existing memberNumber
 */

import 'dotenv/config';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { generateMemberNumber, parseMemberNumber } from '../member-number';
import { auditMemberNumbers } from '../member-number-remediation';
import { memberCounters, user } from '../schema';

// ─────────────────────────────────────────────────────────────────────────────
// Counter Initialization
// ─────────────────────────────────────────────────────────────────────────────

async function initializeCountersFromExisting(years: Set<number>) {
  for (const year of years) {
    console.log(`Initializing counter for year ${year}...`);

    const pattern = `MEM-${year}-%`;
    const existingNumbers = await db
      .select({ memberNumber: user.memberNumber })
      .from(user)
      .where(and(eq(user.role, 'member'), sql`${user.memberNumber} LIKE ${pattern}`));

    let maxSeq = 0;
    for (const row of existingNumbers) {
      if (row.memberNumber) {
        const parsed = parseMemberNumber(row.memberNumber);
        if (parsed && parsed.year === year) {
          if (parsed.sequence > maxSeq) maxSeq = parsed.sequence;
        }
      }
    }

    console.log(`Max existing sequence for ${year} is ${maxSeq}.`);

    // Initialize or update counter to max
    await db
      .insert(memberCounters)
      .values({ year, lastNumber: maxSeq })
      .onConflictDoUpdate({
        target: memberCounters.year,
        set: {
          lastNumber: sql`GREATEST(${memberCounters.lastNumber}, ${maxSeq})`,
        },
      });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Backfill
// ─────────────────────────────────────────────────────────────────────────────

async function backfillMembers() {
  console.log('Starting Global Member Number Backfill...');

  const repairMalformed = process.argv.includes('--repair-malformed');

  // 1. Audit all member numbers
  const allMembers = await db
    .select({
      id: user.id,
      createdAt: user.createdAt,
      memberNumber: user.memberNumber,
    })
    .from(user)
    .where(eq(user.role, 'member'))
    .orderBy(asc(user.createdAt), asc(user.id));

  const audit = auditMemberNumbers(allMembers);

  console.log('Member number audit summary:');
  console.log(`- Missing: ${audit.counts.missing}`);
  console.log(`- Canonical: ${audit.counts.canonical}`);
  console.log(`- Allowed legacy: ${audit.counts.legacyAllowed}`);
  console.log(`- Repairable malformed: ${audit.counts.malformed}`);

  if (audit.repairable.length > 0) {
    console.log(
      `Found ${audit.repairable.length} repairable malformed member numbers: ${audit.repairable
        .slice(0, 10)
        .map(row => `${row.id}:${row.memberNumber}`)
        .join(', ')}`
    );

    if (repairMalformed) {
      const repairableIds = audit.repairable.map(row => row.id);
      await db
        .update(user)
        .set({
          memberNumber: null,
          memberNumberIssuedAt: null,
        })
        .where(inArray(user.id, repairableIds));

      console.log(`Reset ${repairableIds.length} malformed member numbers for canonical reissue.`);
    } else {
      console.log('Run with --repair-malformed to null out repairable values before backfill.');
    }
  }

  // 2. Find all members without memberNumber
  const usersToBackfill = await db
    .select({
      id: user.id,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(and(eq(user.role, 'member'), isNull(user.memberNumber)))
    .orderBy(asc(user.createdAt), asc(user.id));

  if (usersToBackfill.length === 0) {
    console.log('No members to backfill.');
    process.exit(0);
  }

  console.log(`Found ${usersToBackfill.length} members to backfill.`);

  // 3. Collect years and initialize counters
  const years = new Set<number>();
  usersToBackfill.forEach(u => {
    years.add(u.createdAt.getFullYear());
  });

  await initializeCountersFromExisting(years);

  // 4. Process each member
  let successCount = 0;
  let failCount = 0;

  for (const u of usersToBackfill) {
    // 4. Process each member
    // Note: Generator now derives year from joinedAt internally
    // Use joinedAt if available (future-proof), fallback to createdAt
    const joinedAt = (u as any).joinedAt ?? u.createdAt;
    try {
      await db.transaction(async tx => {
        await generateMemberNumber(tx, { userId: u.id, joinedAt });
      });
      process.stdout.write('.');
      successCount++;
    } catch (err) {
      console.error(`\nFailed to generate for user ${u.id}:`, err);
      failCount++;
    }
  }

  console.log(`\nBackfill complete.`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  process.exit(0);
}

backfillMembers().catch(err => {
  console.error('Backfill fatal error:', err);
  process.exit(1);
});
