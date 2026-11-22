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

export async function cleanupSeedUsersByEmail(emails: string[]) {
  if (emails.length === 0) return;
  // Find existing users by email to get their IDs (for FK cleanup)
  const usersToDelete = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(inArray(schema.user.email, emails));
  if (usersToDelete.length === 0) return;
  const idsToDelete = usersToDelete.map(u => u.id);

  await cleanupClaimNotificationRows(db, { userIds: idsToDelete });
  // Delete sessions first
  await db.delete(schema.session).where(inArray(schema.session.userId, idsToDelete));
  // Delete accounts
  await db.delete(schema.account).where(inArray(schema.account.userId, idsToDelete));
  // Delete subscriptions
  if (schema.subscriptions) {
    await db.delete(schema.subscriptions).where(inArray(schema.subscriptions.userId, idsToDelete));
  }
  // Delete access logs & audit logs
  if (schema.documentAccessLog) {
    await db
      .delete(schema.documentAccessLog)
      .where(inArray(schema.documentAccessLog.accessedBy, idsToDelete));
  }
  if (schema.auditLog) {
    await db.delete(schema.auditLog).where(inArray(schema.auditLog.actorId, idsToDelete));
  }
  if (schema.memberNotes) {
    await db.delete(schema.memberNotes).where(inArray(schema.memberNotes.authorId, idsToDelete));
  }
  if (schema.sharePacks) {
    await db
      .delete(schema.sharePacks)
      .where(inArray(schema.sharePacks.createdByUserId, idsToDelete));
    await db
      .delete(schema.sharePacks)
      .where(inArray(schema.sharePacks.revokedByUserId, idsToDelete));
  }
  await cleanupSeedUserDocuments(idsToDelete);
  // Delete users
  await db.delete(schema.user).where(inArray(schema.user.id, idsToDelete));
}

async function cleanupSeedUserDocuments(idsToDelete: string[]) {
  if (!schema.documents) return;
  const userDocIds = await db
    .select({ id: schema.documents.id })
    .from(schema.documents)
    .where(inArray(schema.documents.uploadedBy, idsToDelete));

  const docIds = userDocIds.map(d => d.id);
  if (docIds.length === 0) return;
  if (schema.documentAccessLog) {
    await db
      .delete(schema.documentAccessLog)
      .where(inArray(schema.documentAccessLog.documentId, docIds));
  }
  await db.delete(schema.documents).where(inArray(schema.documents.id, docIds));
}
