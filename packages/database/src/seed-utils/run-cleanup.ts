import { inArray } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../schema';
import { cleanupClaimNotificationRows } from './claim-notification-cleanup';
import { cleanupByPrefixes, cleanupSeedClaims } from './cleanup';

// Seed entry points load this only after the seed target and its database client are initialized.
export async function cleanupSeedPrefixes(prefixes: string[], cleanupEmails?: boolean) {
  await cleanupByPrefixes(db, schema, prefixes, cleanupEmails);
}

export async function cleanupSeedClaimNumbers(claimNumbers: string[]) {
  const claims = await db
    .select({ id: schema.claims.id })
    .from(schema.claims)
    .where(inArray(schema.claims.claimNumber, claimNumbers));
  await cleanupSeedClaims(
    db,
    schema,
    claims.map(({ id }) => id)
  );
}

export async function cleanupSeedUserNotifications(userIds: string[]) {
  await cleanupClaimNotificationRows(db, { userIds });
}
