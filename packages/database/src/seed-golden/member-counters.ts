import type { SeedGoldenContext } from './types';

export async function seedMemberCounters({ at, db, schema, sql }: SeedGoldenContext) {
  console.log('🔢 Initializing Member Counters...');
  await db
    .insert(schema.memberCounters)
    .values({
      year: 2026,
      lastNumber: 100,
      updatedAt: at(),
    })
    .onConflictDoUpdate({
      target: schema.memberCounters.year,
      set: { lastNumber: sql`GREATEST(${schema.memberCounters.lastNumber}, 100)` },
    });
}
